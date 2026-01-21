import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, RecordingState, Settings, HistoryEntry, EnrichmentResult, UsageStats, LLMProvider } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_USAGE_STATS } from '@/types';

// Approximate costs per 1M tokens (Jan 2025)
const COST_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
};

// Whisper cost per minute
const WHISPER_COST_PER_MINUTE = 0.006;

// Token estimation: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Calculate cost for tokens
function calculateTokenCost(tokens: number, model: string, isOutput: boolean): number {
  const costs = COST_PER_1M_TOKENS[model];
  if (!costs) return 0;
  const costPer1M = isOutput ? costs.output : costs.input;
  return (tokens / 1_000_000) * costPer1M;
}

interface AppState {
  // Recording State
  recordingState: RecordingState;
  setRecordingState: (state: RecordingState) => void;

  // Current Mode
  currentMode: Mode;
  setCurrentMode: (mode: Mode) => void;

  // Audio Level (for visualization)
  audioLevel: number;
  setAudioLevel: (level: number) => void;

  // Transcription
  transcript: string;
  setTranscript: (text: string) => void;

  // Enriched Output
  enrichedContent: string;
  setEnrichedContent: (content: string) => void;
  appendEnrichedContent: (chunk: string) => void;

  // Settings
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;

  // Recent Projects
  addRecentProject: (path: string) => void;

  // History
  history: HistoryEntry[];
  addToHistory: (entry: Omit<HistoryEntry, 'id'>) => void;
  clearHistory: () => void;

  // UI State
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;

  // Error Handling
  error: string | null;
  setError: (error: string | null) => void;

  // Reset
  resetSession: () => void;

  // Usage Stats
  usageStats: UsageStats;
  addTranscriptionUsage: (durationSeconds: number) => void;
  addEnrichmentUsage: (inputText: string, outputText: string, provider: LLMProvider, model: string) => void;
  resetUsageStats: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Recording State
      recordingState: 'idle',
      setRecordingState: (recordingState) => set({ recordingState }),

      // Current Mode
      currentMode: 'notes',
      setCurrentMode: (currentMode) => set({ currentMode }),

      // Audio Level
      audioLevel: 0,
      setAudioLevel: (audioLevel) => set({ audioLevel }),

      // Transcription
      transcript: '',
      setTranscript: (transcript) => set({ transcript }),

      // Enriched Output
      enrichedContent: '',
      setEnrichedContent: (enrichedContent) => set({ enrichedContent }),
      appendEnrichedContent: (chunk) =>
        set((state) => ({ enrichedContent: state.enrichedContent + chunk })),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      // Recent Projects
      addRecentProject: (path: string) =>
        set((state) => {
          const current = state.settings.recentProjects ?? [];
          const filtered = current.filter((p) => p !== path);
          return {
            settings: {
              ...state.settings,
              recentProjects: [path, ...filtered].slice(0, 10),
            },
          };
        }),

      // History
      history: [],
      addToHistory: (entry) =>
        set((state) => ({
          history: [
            { ...entry, id: crypto.randomUUID() },
            ...state.history.slice(0, 49), // Keep last 50 entries
          ],
        })),
      clearHistory: () => set({ history: [] }),

      // UI State
      isSettingsOpen: false,
      setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),

      // Error Handling
      error: null,
      setError: (error) => set({ error }),

      // Reset
      resetSession: () =>
        set({
          recordingState: 'idle',
          audioLevel: 0,
          transcript: '',
          enrichedContent: '',
          error: null,
        }),

      // Usage Stats
      usageStats: DEFAULT_USAGE_STATS,

      addTranscriptionUsage: (durationSeconds: number) =>
        set((state) => {
          const minutes = durationSeconds / 60;
          const cost = minutes * WHISPER_COST_PER_MINUTE;
          return {
            usageStats: {
              ...state.usageStats,
              totalTranscriptionMinutes: state.usageStats.totalTranscriptionMinutes + minutes,
              totalRecordings: state.usageStats.totalRecordings + 1,
              byProvider: {
                ...state.usageStats.byProvider,
                openai: {
                  ...state.usageStats.byProvider.openai,
                  cost: state.usageStats.byProvider.openai.cost + cost,
                },
              },
            },
          };
        }),

      addEnrichmentUsage: (inputText: string, outputText: string, provider: LLMProvider, model: string) =>
        set((state) => {
          const inputTokens = estimateTokens(inputText);
          const outputTokens = estimateTokens(outputText);
          const totalTokens = inputTokens + outputTokens;
          const inputCost = calculateTokenCost(inputTokens, model, false);
          const outputCost = calculateTokenCost(outputTokens, model, true);
          const totalCost = inputCost + outputCost;

          return {
            usageStats: {
              ...state.usageStats,
              totalEnrichmentTokens: state.usageStats.totalEnrichmentTokens + totalTokens,
              byProvider: {
                ...state.usageStats.byProvider,
                [provider]: {
                  tokens: state.usageStats.byProvider[provider].tokens + totalTokens,
                  cost: state.usageStats.byProvider[provider].cost + totalCost,
                },
              },
            },
          };
        }),

      resetUsageStats: () =>
        set({
          usageStats: {
            ...DEFAULT_USAGE_STATS,
            lastResetAt: new Date().toISOString(),
          },
        }),
    }),
    {
      name: 'aurora-voice-storage',
      partialize: (state) => ({
        settings: state.settings,
        history: state.history,
        currentMode: state.currentMode,
        usageStats: state.usageStats,
      }),
    }
  )
);
