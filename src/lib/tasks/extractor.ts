// Task Extractor - AI-powered task extraction from meeting transcripts

import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Settings, LLMProvider, ProjectContext } from '@/types';
import type { ExtractedTask, TaskExtractionResult, TaskPriority, TaskExtractionType } from '@/types/task';
import { processStreamWithTimeout } from '@/lib/ai/stream-utils';
import { findMatchingFiles, formatMatchesForPrompt } from '@/lib/project/matcher';
import { splitTranscriptIntoChunks, CHUNK_SIZE } from '@/lib/ai/enrich';

// Prompt for task extraction
const TASK_EXTRACTION_PROMPT = `Du bist ein Experte für das Extrahieren von Aufgaben aus Meeting-Transkripten.

**WICHTIGE REGEL - Nur ZUKÜNFTIGE Aufgaben:**
Extrahiere NUR Aufgaben die NACH dem Meeting erledigt werden müssen.
Wenn etwas IM Meeting bereits erledigt wurde, ist es KEINE Aufgabe.

**BEISPIELE:**
❌ FALSCH (bereits erledigt):
Meeting-Inhalt: "Ich stelle Ihnen heute die Homeoffice-Regelung vor" [Präsentation folgt]
→ KEINE Aufgabe - wurde im Meeting erledigt

❌ FALSCH (bereits diskutiert):
Meeting-Inhalt: "Lassen Sie uns die Bedenken besprechen" [Diskussion folgt]
→ KEINE Aufgabe - wurde im Meeting erledigt

✅ RICHTIG (zukünftige Aufgabe):
Meeting-Inhalt: "Wir werden Pilotprojekte starten"
→ Aufgabe: "Pilotprojekte in ausgewählten Abteilungen starten"

✅ RICHTIG (Follow-up erforderlich):
Meeting-Inhalt: "Wir informieren Sie über die Ergebnisse"
→ Aufgabe: "Ergebnisse der Pilotprojekte kommunizieren"

Analysiere das Transkript und extrahiere ALLE zukünftigen Aufgaben - sowohl explizite als auch implizite:

**Explizite Aufgaben:**
- "Wir sollten...", "Müssen wir...", "Kannst du..."
- Action Items, To-Dos, direkte Anweisungen
- Klar genannte Verantwortlichkeiten

**Implizite Aufgaben:**
Erkenne Handlungsbedarf aus dem Kontext:
- Bestellungen → Aufgabe: "Bestellung aufgeben bei [Lieferant]"
- Termine/Events → Aufgabe: "Termin organisieren/vorbereiten"
- Probleme → Aufgabe: "Problem lösen/untersuchen"

**DEDUPLIZIERUNG - STRIKT:**
Erstelle für jedes THEMA nur EINE Aufgabe, auch wenn es mehrfach erwähnt wird.

Beispiele für DUPLIKATE die zusammengefasst werden MÜSSEN:
- "Arbeitsgruppe einrichten" = "Bildung der Arbeitsgruppe" = "Arbeitsgruppe bilden" = "Bildung und Einrichtung der Arbeitsgruppe"
  → NUR EINE Aufgabe: "Arbeitsgruppe einrichten"
- "Pilotprojekte starten" = "Pilotprojekte durchführen" = "Pilotprojekte planen" = "Pilotprojekte evaluieren"
  → NUR EINE Aufgabe: "Pilotprojekte in ausgewählten Abteilungen durchführen"
- "Schulungen entwickeln" = "Schulungsprogramme erstellen" = "Führungskräfte schulen" = "Training durchführen"
  → NUR EINE Aufgabe: "Schulungsprogramm für Führungskräfte entwickeln"
- "Zeiterfassung einführen" = "Zeiterfassungssystem implementieren" = "Arbeitszeit dokumentieren"
  → NUR EINE Aufgabe: "Zeiterfassungssystem implementieren"
- "Richtlinien erstellen" = "Regelwerk definieren" = "Guidelines entwickeln" = "Kommunikationsregeln festlegen"
  → NUR EINE Aufgabe: "Richtlinien und Regelwerk erstellen"

WICHTIG: Prüfe VOR dem Hinzufügen jeder Aufgabe, ob bereits eine ähnliche existiert!

Für jede Aufgabe erstelle:
{
  "title": "Aufgabentitel (handlungsorientiert)",
  "assigneeName": "Name der Person oder null",
  "dueDate": "Deadline als Text oder null",
  "priority": "high" | "medium" | "low",
  "sourceText": "Originaler Textausschnitt",
  "confidence": 0.5-1.0,
  "type": "explicit" | "implicit",
  "linkedFile": "Dateipfad falls relevant oder null"
}

Regeln:
- NUR Aufgaben für NACH dem Meeting, nicht bereits Erledigtes
- Bei ähnlichen Aufgaben: ZU EINER zusammenfassen (keine Duplikate)
- Setze confidence: 0.8-1.0 für explicit, 0.5-0.8 für implicit
- Wenn keine Aufgaben gefunden werden, antworte mit []
- Antworte NUR mit dem JSON-Array, keine Erklärungen
`;

// Project context addition for the prompt
const PROJECT_CONTEXT_PROMPT = `
**Projekt-Kontext:**
Bekannte Dateien im Projekt:
{files}

Erkannte Datei-Referenzen im Transkript:
{matches}

Wenn eine Aufgabe sich auf eine dieser Dateien bezieht:
- Verwende den exakten Dateipfad im Titel
- Setze "linkedFile": "path/to/file.ts"
- Beispiel: "Bug in src/controllers/UserController.ts fixen"

`;

const TRANSCRIPT_PREFIX = `Transkript:
`;

function getModel(settings: Settings) {
  const { selectedProvider, selectedModel, openaiApiKey, anthropicApiKey, ollamaBaseUrl } = settings;

  switch (selectedProvider) {
    case 'openai': {
      if (!openaiApiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey: openaiApiKey });
      return openai(selectedModel || 'gpt-4o');
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

// Build the prompt with optional project context
function buildTaskExtractionPrompt(
  transcript: string,
  projectContext?: ProjectContext | null
): string {
  let prompt = TASK_EXTRACTION_PROMPT;

  // Add project context if available
  if (projectContext && projectContext.files.length > 0) {
    // Find matching files in the transcript
    const matches = findMatchingFiles(transcript, projectContext, {
      minRelevance: 0.5,
      maxResults: 10,
    });

    // Build the file list (limit to most relevant files)
    const relevantFiles = projectContext.files
      .filter((f) => f.type === 'code')
      .slice(0, 50)
      .map((f) => `- ${f.path}`)
      .join('\n');

    const matchesText = matches.length > 0
      ? formatMatchesForPrompt(matches)
      : 'Keine direkten Datei-Referenzen erkannt';

    prompt += PROJECT_CONTEXT_PROMPT
      .replace('{files}', relevantFiles || 'Keine Dateien indexiert')
      .replace('{matches}', matchesText);
  }

  prompt += TRANSCRIPT_PREFIX + transcript;

  return prompt;
}

// Extract tasks from transcript using AI
export async function extractTasksFromTranscript(
  transcript: string,
  settings: Settings,
  projectContext?: ProjectContext | null
): Promise<TaskExtractionResult> {
  if (!transcript.trim()) {
    return { tasks: [], rawResponse: '[]' };
  }

  const transcriptSize = new Blob([transcript]).size;
  const model = getModel(settings);

  // Small transcript - process normally
  if (transcriptSize <= CHUNK_SIZE) {
    const prompt = buildTaskExtractionPrompt(transcript, projectContext);

    const { textStream } = streamText({
      model,
      prompt,
    });

    const fullText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000 // 5 minutes timeout
    );

    // Parse JSON response
    const tasks = parseTasksFromResponse(fullText);

    return {
      tasks,
      rawResponse: fullText,
    };
  }

  // Large transcript - use chunking
  console.log(`Tasks: Transcript size ${(transcriptSize / 1024).toFixed(0)} KB - using chunking`);
  const chunks = splitTranscriptIntoChunks(transcript, CHUNK_SIZE);
  console.log(`Tasks: Split into ${chunks.length} chunks`);

  const allTasks: ExtractedTask[] = [];
  const seenTitles = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Tasks: Processing chunk ${i + 1}/${chunks.length}`);
    const prompt = buildTaskExtractionPrompt(chunks[i], projectContext);

    const { textStream } = streamText({
      model,
      prompt,
    });

    const chunkText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000
    );

    const chunkTasks = parseTasksFromResponse(chunkText);

    // Deduplicate by title prefix
    for (const task of chunkTasks) {
      const key = task.title.toLowerCase().slice(0, 30);
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        allTasks.push(task);
      }
    }
  }

  return {
    tasks: allTasks,
    rawResponse: JSON.stringify(allTasks),
  };
}

// Parse tasks from AI response
function parseTasksFromResponse(response: string): ExtractedTask[] {
  try {
    // Try to extract JSON from response (might have extra text)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      console.warn('Parsed result is not an array');
      return [];
    }

    // Validate and transform each task
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        title: String(item.title || 'Untitled Task'),
        assigneeName: item.assigneeName ? String(item.assigneeName) : undefined,
        dueDate: item.dueDate ? String(item.dueDate) : undefined,
        priority: validatePriority(item.priority),
        // Fix H8: Handle sourceText that might be an object or other non-string type
        sourceText: typeof item.sourceText === 'string'
          ? item.sourceText
          : (item.sourceText ? JSON.stringify(item.sourceText) : ''),
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
        type: validateTaskType(item.type),
        linkedFile: item.linkedFile ? String(item.linkedFile) : undefined,
      }));
  } catch (err) {
    console.error('Failed to parse tasks from response:', err);
    return [];
  }
}

// Validate and normalize priority
function validatePriority(priority: unknown): TaskPriority {
  const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
  if (typeof priority === 'string' && validPriorities.includes(priority as TaskPriority)) {
    return priority as TaskPriority;
  }
  return 'medium';
}

// Validate and normalize task extraction type
function validateTaskType(type: unknown): TaskExtractionType {
  const validTypes: TaskExtractionType[] = ['explicit', 'implicit'];
  if (typeof type === 'string' && validTypes.includes(type as TaskExtractionType)) {
    return type as TaskExtractionType;
  }
  return 'explicit'; // default to explicit if not specified
}

// Extract tasks from a specific text segment
export async function extractTasksFromSegment(
  text: string,
  settings: Settings,
  timestamp?: number
): Promise<ExtractedTask[]> {
  const result = await extractTasksFromTranscript(text, settings);

  // Add timestamp to source if provided
  if (timestamp !== undefined) {
    return result.tasks.map((task) => ({
      ...task,
      sourceText: `[${formatTimestamp(timestamp)}] ${task.sourceText}`,
    }));
  }

  return result.tasks;
}

// Format timestamp as MM:SS
function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Quick extraction for real-time task hints
// Uses simpler pattern matching for speed, not full AI
export function quickExtractTaskHints(text: string): string[] {
  const hints: string[] = [];

  // Common task patterns (German + English)
  const patterns = [
    /(?:müssen|muss|sollte|sollen|kannst du|könntest du|bitte)\s+(.+?)(?:\.|$)/gi,
    /(?:action item|todo|to-do|aufgabe)[:\s]+(.+?)(?:\.|$)/gi,
    /(?:bis|until|by)\s+(?:morgen|nächste woche|freitag|montag|tomorrow|next week|friday|monday)\s+(.+?)(?:\.|$)/gi,
    /(.+?)\s+(?:ist verantwortlich|is responsible|übernimmt|takes over)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const hint = match[1]?.trim();
      if (hint && hint.length > 5 && hint.length < 200) {
        hints.push(hint);
      }
    }
  }

  return [...new Set(hints)]; // Remove duplicates
}

// Check if text likely contains tasks
export function likelyContainsTasks(text: string): boolean {
  const taskIndicators = [
    /müssen|muss|sollte|sollen/i,
    /action item|todo|to-do|aufgabe/i,
    /verantwortlich|responsible|übernimmt|takes/i,
    /bis morgen|bis freitag|nächste woche|next week|by friday/i,
    /bitte|kannst du|könntest du|please|could you/i,
    /deadline|frist|termin|due/i,
    /erledigen|complete|finish|fertig/i,
  ];

  return taskIndicators.some((pattern) => pattern.test(text));
}
