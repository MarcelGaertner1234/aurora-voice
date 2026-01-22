// Re-export meeting assistant types
export * from './meeting';
export * from './task';
export * from './speaker';
export * from './research';
export * from './project';
export * from './agent';

export type Mode = 'notes' | 'meeting' | 'code';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'transcribing' | 'enriching';

export type LLMProvider = 'openai' | 'anthropic' | 'ollama';

// Custom prompts per mode (null = use default)
export interface CustomPrompts {
  notes: string | null;
  meeting: string | null;
  code: string | null;
}

// Usage statistics
export interface UsageStats {
  totalTranscriptionMinutes: number;
  totalEnrichmentTokens: number;
  totalRecordings: number;
  lastResetAt: string | null; // ISO string for JSON serialization
  byProvider: {
    openai: { tokens: number; cost: number };
    anthropic: { tokens: number; cost: number };
    ollama: { tokens: number; cost: number };
  };
}

export interface Settings {
  openaiApiKey: string;
  anthropicApiKey: string;
  ollamaBaseUrl: string;
  selectedProvider: LLMProvider;
  selectedModel: string;
  language: string;
  hotkeyEnabled: boolean;
  hotkey: string;
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  recentProjects: string[]; // Last 10 project paths
  // Custom prompts
  customPrompts: CustomPrompts;
  // Obsidian integration
  obsidianVaultPath: string | null;
  obsidianSubfolder: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

export interface EnrichmentResult {
  content: string;
  mode: Mode;
  timestamp: Date;
  originalTranscript: string;
}

export interface HistoryEntry {
  id: string;
  mode: Mode;
  originalTranscript: string;
  enrichedContent: string;
  timestamp: Date;
  duration: number;
}

export interface AudioLevel {
  level: number;
  timestamp: number;
}

export const DEFAULT_SETTINGS: Settings = {
  openaiApiKey: '',
  anthropicApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  selectedProvider: 'openai',
  selectedModel: 'gpt-4o',
  language: 'auto',
  hotkeyEnabled: true,
  hotkey: 'CommandOrControl+Shift+Space',
  alwaysOnTop: false,
  launchAtStartup: false,
  recentProjects: [],
  customPrompts: {
    notes: null,
    meeting: null,
    code: null,
  },
  obsidianVaultPath: null,
  obsidianSubfolder: 'Aurora',
};

export const DEFAULT_USAGE_STATS: UsageStats = {
  totalTranscriptionMinutes: 0,
  totalEnrichmentTokens: 0,
  totalRecordings: 0,
  lastResetAt: null,
  byProvider: {
    openai: { tokens: 0, cost: 0 },
    anthropic: { tokens: 0, cost: 0 },
    ollama: { tokens: 0, cost: 0 },
  },
};

export const MODE_CONFIG = {
  notes: {
    label: 'Smart Notes',
    icon: 'FileText',
    description: 'Strukturierte Notizen mit Highlights',
    prompt: `Du bist ein intelligenter Notiz-Assistent. Wandle die folgende Sprachaufnahme in gut strukturierte Notizen um.

Regeln:
- Verwende klare Überschriften und Bullet Points
- Hebe wichtige Punkte hervor
- Fasse lange Passagen zusammen
- Behalte wichtige Details bei
- Formatiere mit Markdown

Transkript:`,
  },
  meeting: {
    label: 'Meeting Summary',
    icon: 'Users',
    description: 'Zusammenfassung, Action Items, Entscheidungen',
    prompt: `Du bist ein Meeting-Protokoll-Assistent. Erstelle aus der folgenden Aufnahme eine strukturierte Meeting-Zusammenfassung.

Formatiere die Ausgabe so:
## Zusammenfassung
(2-3 Sätze Überblick)

## Wichtige Punkte
- Punkt 1
- Punkt 2

## Action Items
- [ ] Aufgabe 1 (Verantwortlich: Name)
- [ ] Aufgabe 2

## Entscheidungen
- Entscheidung 1
- Entscheidung 2

## Offene Fragen
- Frage 1

Transkript:`,
  },
  code: {
    label: 'Code Assistant',
    icon: 'Code',
    description: 'Code-Erklärung, Dokumentation, Verbesserungen',
    prompt: `Du bist ein Code-Assistent. Analysiere die folgende Sprachaufnahme, die Code oder technische Konzepte beschreibt.

Je nach Inhalt:
- Erkläre Code-Konzepte verständlich
- Generiere Code-Snippets wenn beschrieben
- Schlage Verbesserungen vor
- Dokumentiere Funktionen
- Formatiere Code-Blöcke korrekt mit Syntax-Highlighting

Verwende Markdown mit \`\`\`language für Code-Blöcke.

Transkript:`,
  },
} as const;

// Extend Window interface for Tauri runtime detection
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
