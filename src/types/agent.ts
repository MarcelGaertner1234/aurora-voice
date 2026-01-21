// AI Agent Types for Aurora Meeting Assistant

// Context selection types for sidebar
export type ContextItemType = 'task' | 'question' | 'decision';

export interface SelectedContextItem {
  type: ContextItemType;
  id: string;
  title: string;  // Kurztext für Chip-Anzeige
  data: unknown;  // Original Task/Question/Decision
}

export interface AgentWebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

export interface AgentContext {
  meetingId: string;
  includedTasks?: string[];      // Task IDs that were referenced
  includedDecisions?: string[];  // Decision IDs
  includedQuestions?: string[];  // Question IDs
  projectFiles?: string[];       // Referenced file paths
  webSearchResults?: AgentWebSearchResult[];
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  context?: AgentContext;
  toolCalls?: AgentToolCall[];
}

export interface AgentQuickAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  requiresSelection?: boolean;
}

export type AgentToolName =
  | 'completeTask'
  | 'updateTaskNotes'
  | 'answerQuestion'
  | 'markQuestionAnswered'
  | 'addDecision'
  | 'readProjectFile'
  | 'searchProjectFiles'
  | 'getMeetingSummary'
  | 'getOpenTasks'
  | 'getOpenQuestions';

export interface AgentStreamOptions {
  messages: AgentMessage[];
  meetingId: string;
  onChunk: (chunk: string) => void;
  onToolCall?: (toolCall: AgentToolCall) => void;
  signal?: AbortSignal;
}

// Quick actions available in the UI
export const AGENT_QUICK_ACTIONS: AgentQuickAction[] = [
  {
    id: 'research-task',
    label: 'Aufgabe recherchieren',
    icon: 'Search',
    prompt: 'Recherchiere Hintergrund und mögliche nächste Schritte für die Aufgabe: ',
    requiresSelection: true,
  },
  {
    id: 'answer-question',
    label: 'Frage beantworten',
    icon: 'HelpCircle',
    prompt: 'Beantworte diese offene Frage basierend auf dem Meeting-Kontext: ',
    requiresSelection: true,
  },
  {
    id: 'find-code',
    label: 'Code finden',
    icon: 'Code',
    prompt: 'Finde relevante Code-Dateien im verknüpften Projekt für: ',
    requiresSelection: false,
  },
  {
    id: 'explain-decision',
    label: 'Entscheidung erklären',
    icon: 'Lightbulb',
    prompt: 'Erkläre den Kontext und die Auswirkungen dieser Entscheidung: ',
    requiresSelection: true,
  },
];
