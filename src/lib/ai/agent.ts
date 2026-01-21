// AI Agent for Aurora Meeting Assistant
// Provides an autonomous assistant that can interact with meeting data

import { streamText, stepCountIs, tool, zodSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type { Settings } from '@/types';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { ProjectContext } from '@/types/project';
import type { AgentMessage, AgentToolCall } from '@/types/agent';
import type { WebSearchResult } from '@/types/research';
import { buildAgentSystemPrompt } from './agent-prompts';

export interface AgentOptions {
  messages: AgentMessage[];
  meeting: Meeting;
  tasks: Task[];
  settings: Settings;
  projectContext?: ProjectContext | null;
  signal?: AbortSignal;
  // Callbacks for tool execution
  onCompleteTask?: (taskId: string) => Promise<void>;
  onUpdateTaskNotes?: (taskId: string, notes: string) => Promise<void>;
  onAnswerQuestion?: (questionId: string, answer: string) => Promise<void>;
  onMarkQuestionAnswered?: (questionId: string) => Promise<void>;
  onAddDecision?: (text: string, assigneeName?: string) => Promise<void>;
  onReadProjectFile?: (filePath: string) => Promise<string>;
  onWebSearch?: (query: string) => Promise<WebSearchResult[]>;
}

export interface AgentStreamResult {
  text: string;
  toolCalls: AgentToolCall[];
}

/**
 * Get the AI model based on user settings.
 */
function getModel(settings: Settings) {
  const { selectedProvider, selectedModel, openaiApiKey, anthropicApiKey, ollamaBaseUrl } = settings;

  switch (selectedProvider) {
    case 'openai': {
      if (!openaiApiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey: openaiApiKey });
      // Use .chat() to force /v1/chat/completions instead of /v1/responses
      return openai.chat(selectedModel || 'gpt-4o');
    }
    case 'anthropic': {
      if (!anthropicApiKey) throw new Error('Anthropic API key is required');
      const anthropic = createAnthropic({ apiKey: anthropicApiKey });
      return anthropic(selectedModel || 'claude-sonnet-4-20250514');
    }
    case 'ollama': {
      const openai = createOpenAI({
        baseURL: `${ollamaBaseUrl}/v1`,
        apiKey: 'ollama',
      });
      return openai(selectedModel || 'llama3.2');
    }
    default:
      throw new Error(`Unknown provider: ${selectedProvider}`);
  }
}

// Tool schemas for validation - WRAPPED with zodSchema() for AI SDK v6
const toolSchemas = {
  completeTask: zodSchema(z.object({
    taskId: z.string().describe('Die ID der Aufgabe (z.B. aus der Aufgabenliste)'),
    reason: z.string().optional().describe('Grund für die Erledigung'),
  })),
  updateTaskNotes: zodSchema(z.object({
    taskId: z.string().describe('Die ID der Aufgabe'),
    notes: z.string().describe('Die Notizen für die Aufgabe'),
  })),
  answerQuestion: zodSchema(z.object({
    questionId: z.string().describe('Die ID der Frage'),
    answer: z.string().describe('Die Antwort auf die Frage'),
  })),
  markQuestionAnswered: zodSchema(z.object({
    questionId: z.string().describe('Die ID der Frage'),
  })),
  addDecision: zodSchema(z.object({
    text: z.string().describe('Der Text der Entscheidung'),
    assigneeName: z.string().optional().describe('Name der verantwortlichen Person'),
  })),
  readProjectFile: zodSchema(z.object({
    filePath: z.string().describe('Relativer Pfad zur Datei im Projekt (z.B. "src/components/Button.tsx")'),
  })),
  searchProjectFiles: zodSchema(z.object({
    query: z.string().describe('Suchbegriff für Dateinamen oder Pfade'),
  })),
  getMeetingSummary: zodSchema(z.object({})),
  getOpenTasks: zodSchema(z.object({})),
  getOpenQuestions: zodSchema(z.object({})),
  webSearch: zodSchema(z.object({
    query: z.string().describe('Die Suchanfrage für die Internet-Recherche'),
  })),
};

/**
 * Build the tools available to the agent based on provided callbacks.
 * Uses parameters + execute format for AI SDK v6 automatic tool execution.
 */
function buildAgentTools(options: AgentOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  // Task completion tool
  if (options.onCompleteTask) {
    tools.completeTask = tool({
      description: 'Markiert eine Aufgabe als erledigt. Nutze dies wenn der Benutzer eine Aufgabe als abgeschlossen markieren möchte.',
      inputSchema: toolSchemas.completeTask,
      execute: async ({ taskId, reason }) => {
        await options.onCompleteTask!(taskId);
        return `Aufgabe wurde als erledigt markiert.${reason ? ` Grund: ${reason}` : ''}`;
      },
    });
  }

  // Update task notes tool
  if (options.onUpdateTaskNotes) {
    tools.updateTaskNotes = tool({
      description: 'Fügt Notizen zu einer Aufgabe hinzu oder aktualisiert sie.',
      inputSchema: toolSchemas.updateTaskNotes,
      execute: async ({ taskId, notes }) => {
        await options.onUpdateTaskNotes!(taskId, notes);
        return 'Notizen wurden zur Aufgabe hinzugefügt.';
      },
    });
  }

  // Answer question tool
  if (options.onAnswerQuestion) {
    tools.answerQuestion = tool({
      description: 'Beantwortet eine offene Frage aus dem Meeting und speichert die Antwort.',
      inputSchema: toolSchemas.answerQuestion,
      execute: async ({ questionId, answer }) => {
        await options.onAnswerQuestion!(questionId, answer);
        return 'Frage wurde beantwortet und als erledigt markiert.';
      },
    });
  }

  // Mark question as answered (without providing answer)
  if (options.onMarkQuestionAnswered) {
    tools.markQuestionAnswered = tool({
      description: 'Markiert eine Frage als beantwortet ohne eine spezifische Antwort zu speichern.',
      inputSchema: toolSchemas.markQuestionAnswered,
      execute: async ({ questionId }) => {
        await options.onMarkQuestionAnswered!(questionId);
        return 'Frage wurde als beantwortet markiert.';
      },
    });
  }

  // Add decision tool
  if (options.onAddDecision) {
    tools.addDecision = tool({
      description: 'Fügt eine neue Entscheidung zum Meeting hinzu.',
      inputSchema: toolSchemas.addDecision,
      execute: async ({ text, assigneeName }) => {
        await options.onAddDecision!(text, assigneeName);
        return 'Entscheidung wurde hinzugefügt.';
      },
    });
  }

  // Read project file tool
  if (options.onReadProjectFile && options.projectContext) {
    tools.readProjectFile = tool({
      description: 'Liest den Inhalt einer Datei aus dem verknüpften Projekt. Nutze dies um Code oder Dokumentation zu analysieren.',
      inputSchema: toolSchemas.readProjectFile,
      execute: async ({ filePath }) => {
        const content = await options.onReadProjectFile!(filePath);
        if (!content) {
          return `Datei nicht gefunden: ${filePath}`;
        }
        const maxLength = 5000;
        if (content.length > maxLength) {
          return `Datei: ${filePath}\n\n\`\`\`\n${content.slice(0, maxLength)}\n\`\`\`\n\n[... Datei gekürzt, ${content.length - maxLength} weitere Zeichen ...]`;
        }
        return `Datei: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``;
      },
    });

    // Search project files tool
    tools.searchProjectFiles = tool({
      description: 'Sucht nach Dateien im verknüpften Projekt basierend auf Dateinamen oder Pfad.',
      inputSchema: toolSchemas.searchProjectFiles,
      execute: async ({ query }) => {
        const context = options.projectContext!;
        const queryLower = query.toLowerCase();
        const matches = context.files.filter(
          f => f.path.toLowerCase().includes(queryLower) ||
               f.name.toLowerCase().includes(queryLower)
        );
        if (matches.length === 0) {
          return `Keine Dateien gefunden für: "${query}"`;
        }
        const topMatches = matches.slice(0, 15);
        const result = topMatches
          .map(f => `- \`${f.path}\` (${f.type}, ${formatFileSize(f.size)})`)
          .join('\n');
        return `Gefundene Dateien für "${query}":\n${result}${matches.length > 15 ? `\n\n... und ${matches.length - 15} weitere` : ''}`;
      },
    });
  }

  // Read-only tools (always available)
  tools.getMeetingSummary = tool({
    description: 'Gibt die Meeting-Zusammenfassung und Kernpunkte zurück.',
    inputSchema: toolSchemas.getMeetingSummary,
    execute: async () => {
      const meeting = options.meeting;
      if (!meeting.summary) {
        return 'Keine Zusammenfassung verfügbar.';
      }
      let result = `## Zusammenfassung\n${meeting.summary.overview || 'Keine Zusammenfassung.'}\n\n`;
      if (meeting.summary.keyPoints && meeting.summary.keyPoints.length > 0) {
        result += `## Kernpunkte\n${meeting.summary.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      }
      return result;
    },
  });

  tools.getOpenTasks = tool({
    description: 'Gibt alle offenen Aufgaben des Meetings zurück.',
    inputSchema: toolSchemas.getOpenTasks,
    execute: async () => {
      const openTasks = options.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
      if (openTasks.length === 0) {
        return 'Keine offenen Aufgaben.';
      }
      const priorityEmoji: Record<string, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      return openTasks.map(t =>
        `- [${t.id}] **${t.title}** ${priorityEmoji[t.priority]} ${t.priority}${t.assigneeName ? ` (@${t.assigneeName})` : ''}${t.notes ? `\n  Notiz: ${t.notes}` : ''}`
      ).join('\n');
    },
  });

  tools.getOpenQuestions = tool({
    description: 'Gibt alle offenen Fragen des Meetings zurück.',
    inputSchema: toolSchemas.getOpenQuestions,
    execute: async () => {
      const openQuestions = options.meeting.summary?.openQuestions?.filter(q => !q.answered) || [];
      if (openQuestions.length === 0) {
        return 'Keine offenen Fragen.';
      }
      return openQuestions.map(q =>
        `- [${q.id}] ${q.text}${q.assigneeName ? ` (@${q.assigneeName})` : ''}${q.context ? `\n  Kontext: ${q.context}` : ''}`
      ).join('\n');
    },
  });

  // Web search tool
  if (options.onWebSearch) {
    tools.webSearch = tool({
      description: 'Führt eine Internet-Recherche durch mit DuckDuckGo und Wikipedia. Nutze dies um aktuelle Informationen, Fakten oder Hintergründe zu recherchieren.',
      inputSchema: toolSchemas.webSearch,
      execute: async ({ query }) => {
        const results = await options.onWebSearch!(query);
        if (!results || results.length === 0) {
          return `Keine Suchergebnisse gefunden für: "${query}"`;
        }
        return `## Suchergebnisse für "${query}"\n\n${results.map((r, i) =>
          `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}\n   _Quelle: ${r.source}_`
        ).join('\n\n')}`;
      },
    });
  }

  return tools;
}

/**
 * Execute a tool call and return the result.
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: AgentOptions
): Promise<string> {
  try {
    switch (toolName) {
      case 'completeTask': {
        const { taskId, reason } = args as { taskId: string; reason?: string };
        if (options.onCompleteTask) {
          await options.onCompleteTask(taskId);
          return `Aufgabe wurde als erledigt markiert.${reason ? ` Grund: ${reason}` : ''}`;
        }
        return 'Tool nicht verfügbar.';
      }

      case 'updateTaskNotes': {
        const { taskId, notes } = args as { taskId: string; notes: string };
        if (options.onUpdateTaskNotes) {
          await options.onUpdateTaskNotes(taskId, notes);
          return 'Notizen wurden zur Aufgabe hinzugefügt.';
        }
        return 'Tool nicht verfügbar.';
      }

      case 'answerQuestion': {
        const { questionId, answer } = args as { questionId: string; answer: string };
        if (options.onAnswerQuestion) {
          await options.onAnswerQuestion(questionId, answer);
          return 'Frage wurde beantwortet und als erledigt markiert.';
        }
        return 'Tool nicht verfügbar.';
      }

      case 'markQuestionAnswered': {
        const { questionId } = args as { questionId: string };
        if (options.onMarkQuestionAnswered) {
          await options.onMarkQuestionAnswered(questionId);
          return 'Frage wurde als beantwortet markiert.';
        }
        return 'Tool nicht verfügbar.';
      }

      case 'addDecision': {
        const { text, assigneeName } = args as { text: string; assigneeName?: string };
        if (options.onAddDecision) {
          await options.onAddDecision(text, assigneeName);
          return 'Entscheidung wurde hinzugefügt.';
        }
        return 'Tool nicht verfügbar.';
      }

      case 'readProjectFile': {
        const { filePath } = args as { filePath: string };
        if (options.onReadProjectFile && options.projectContext) {
          const content = await options.onReadProjectFile(filePath);
          if (!content) {
            return `Datei nicht gefunden: ${filePath}`;
          }
          // Truncate very long files
          const maxLength = 5000;
          if (content.length > maxLength) {
            return `Datei: ${filePath}\n\n\`\`\`\n${content.slice(0, maxLength)}\n\`\`\`\n\n[... Datei gekürzt, ${content.length - maxLength} weitere Zeichen ...]`;
          }
          return `Datei: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``;
        }
        return 'Kein Projekt verknüpft.';
      }

      case 'searchProjectFiles': {
        const { query } = args as { query: string };
        const context = options.projectContext;
        if (!context) {
          return 'Kein Projekt verknüpft.';
        }

        const queryLower = query.toLowerCase();
        const matches = context.files.filter(
          f => f.path.toLowerCase().includes(queryLower) ||
               f.name.toLowerCase().includes(queryLower)
        );

        if (matches.length === 0) {
          return `Keine Dateien gefunden für: "${query}"`;
        }

        const topMatches = matches.slice(0, 15);
        const result = topMatches
          .map(f => `- \`${f.path}\` (${f.type}, ${formatFileSize(f.size)})`)
          .join('\n');

        return `Gefundene Dateien für "${query}":\n${result}${matches.length > 15 ? `\n\n... und ${matches.length - 15} weitere` : ''}`;
      }

      case 'getMeetingSummary': {
        const meeting = options.meeting;
        if (!meeting.summary) {
          return 'Keine Zusammenfassung verfügbar.';
        }

        let result = `## Zusammenfassung\n${meeting.summary.overview || 'Keine Zusammenfassung.'}\n\n`;

        if (meeting.summary.keyPoints && meeting.summary.keyPoints.length > 0) {
          result += `## Kernpunkte\n${meeting.summary.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
        }

        return result;
      }

      case 'getOpenTasks': {
        const openTasks = options.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

        if (openTasks.length === 0) {
          return 'Keine offenen Aufgaben.';
        }

        const priorityEmoji: Record<string, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

        return openTasks.map(t =>
          `- [${t.id}] **${t.title}** ${priorityEmoji[t.priority]} ${t.priority}${t.assigneeName ? ` (@${t.assigneeName})` : ''}${t.notes ? `\n  Notiz: ${t.notes}` : ''}`
        ).join('\n');
      }

      case 'getOpenQuestions': {
        const openQuestions = options.meeting.summary?.openQuestions?.filter(q => !q.answered) || [];

        if (openQuestions.length === 0) {
          return 'Keine offenen Fragen.';
        }

        return openQuestions.map(q =>
          `- [${q.id}] ${q.text}${q.assigneeName ? ` (@${q.assigneeName})` : ''}${q.context ? `\n  Kontext: ${q.context}` : ''}`
        ).join('\n');
      }

      case 'webSearch': {
        const { query } = args as { query: string };
        if (options.onWebSearch) {
          const results = await options.onWebSearch(query);
          if (results.length === 0) {
            return `Keine Suchergebnisse gefunden für: "${query}"`;
          }
          return `## Suchergebnisse für "${query}"\n\n${results.map((r, i) =>
            `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}\n   _Quelle: ${r.source}_`
          ).join('\n\n')}`;
        }
        return 'Web-Suche ist nicht verfügbar.';
      }

      default:
        return `Unbekanntes Tool: ${toolName}`;
    }
  } catch (error) {
    return `Fehler beim Ausführen von ${toolName}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

/**
 * Format file size in human-readable format.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Stream a response from the AI agent.
 */
export async function streamAgentResponse(
  options: AgentOptions,
  onChunk: (chunk: string) => void,
  onToolCall?: (toolCall: AgentToolCall) => void
): Promise<AgentStreamResult> {
  const model = getModel(options.settings);
  const systemPrompt = buildAgentSystemPrompt(options.meeting, options.tasks, options.projectContext);
  const tools = buildAgentTools(options);

  // Convert agent messages to AI SDK format
  const messages = options.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const toolCalls: AgentToolCall[] = [];

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,                    // Pass tools for automatic execution
      stopWhen: stepCountIs(5), // Allow multiple tool calls (up to 5 steps)
      abortSignal: options.signal,
    });

    let fullText = '';

    // Process the stream with tool results included
    for await (const chunk of result.textStream) {
      if (options.signal?.aborted) {
        break;
      }

      fullText += chunk;
      onChunk(chunk);
    }

    return { text: fullText, toolCalls };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Anfrage wurde abgebrochen');
    }
    throw error;
  }
}

/**
 * Get a simple non-streaming response from the agent.
 * Useful for quick queries where streaming isn't needed.
 */
export async function getAgentResponse(options: AgentOptions): Promise<AgentStreamResult> {
  let fullText = '';
  const toolCalls: AgentToolCall[] = [];

  const result = await streamAgentResponse(
    options,
    (chunk) => { fullText += chunk; },
    (toolCall) => { toolCalls.push(toolCall); }
  );

  return result;
}
