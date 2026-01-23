// Search Store for Aurora Voice
// Manages semantic search state and operations

import { create } from 'zustand';
import { getAllMeetings } from '@/lib/db';
import {
  semanticSearch,
  indexMeeting,
  indexMeetings,
  getSearchStats,
  getSuggestedQueries,
  type EnrichedSearchResult,
  type IndexingConfig,
  type SearchConfig,
} from '@/lib/search/semantic-search';
import { isMeetingIndexed, deleteVectorsByMeetingId } from '@/lib/search/vector-store';
import { checkEmbeddingAvailability } from '@/lib/search/embeddings';
import type { Meeting } from '@/types/meeting';
import { logger } from '@/lib/utils/logger';

interface SearchState {
  // Search state
  query: string;
  results: EnrichedSearchResult[];
  isSearching: boolean;
  searchError: string | null;

  // Index state
  isIndexing: boolean;
  indexProgress: { current: number; total: number } | null;
  indexedVectorsCount: number;
  indexingError: string | null;

  // Meetings reference
  meetings: Meeting[];
  meetingMap: Map<string, Meeting>;

  // Provider availability
  providerAvailable: boolean;
  providerError: string | null;

  // Suggestions
  suggestedQueries: string[];

  // Configuration
  config: SearchConfig | null;

  // Actions
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;

  // Indexing
  loadMeetingsAndCheckIndex: () => Promise<void>;
  indexAllMeetings: () => Promise<void>;
  indexSingleMeeting: (meetingId: string) => Promise<void>;
  reindexMeeting: (meetingId: string) => Promise<void>;

  // Configuration
  setConfig: (config: SearchConfig) => void;
  checkProvider: () => Promise<void>;

  // Utilities
  isMeetingIndexed: (meetingId: string) => Promise<boolean>;
  clearError: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  // Initial state
  query: '',
  results: [],
  isSearching: false,
  searchError: null,

  isIndexing: false,
  indexProgress: null,
  indexedVectorsCount: 0,
  indexingError: null,

  meetings: [],
  meetingMap: new Map(),

  providerAvailable: false,
  providerError: null,

  suggestedQueries: [],

  config: null,

  // Set search query
  setQuery: (query: string) => {
    set({ query });
  },

  // Perform semantic search
  search: async (query: string) => {
    const { config, meetingMap } = get();

    if (!config) {
      set({ searchError: 'Suchkonfiguration nicht gesetzt' });
      return;
    }

    if (!query.trim()) {
      set({ results: [], searchError: null });
      return;
    }

    set({ isSearching: true, searchError: null, query });

    try {
      const results = await semanticSearch(query, config, meetingMap);
      set({ results, isSearching: false });
    } catch (err) {
      set({
        searchError: err instanceof Error ? err.message : 'Suche fehlgeschlagen',
        isSearching: false,
        results: [],
      });
    }
  },

  // Clear search
  clearSearch: () => {
    set({ query: '', results: [], searchError: null });
  },

  // Load meetings and check index status
  loadMeetingsAndCheckIndex: async () => {
    try {
      const meetings = await getAllMeetings();
      const meetingMap = new Map(meetings.map(m => [m.id, m]));

      // Get index stats
      const stats = await getSearchStats();

      // Generate suggestions
      const suggestions = getSuggestedQueries(meetings);

      set({
        meetings,
        meetingMap,
        indexedVectorsCount: stats.indexedVectors,
        suggestedQueries: suggestions,
      });
    } catch (err) {
      logger.error('Failed to load meetings for search:', err);
    }
  },

  // Index all meetings
  indexAllMeetings: async () => {
    const { config, meetings } = get();

    if (!config) {
      set({ indexingError: 'Suchkonfiguration nicht gesetzt' });
      return;
    }

    // Filter to only meetings with summaries
    const meetingsToIndex = meetings.filter(m => m.summary);

    if (meetingsToIndex.length === 0) {
      set({ indexingError: 'Keine Meetings mit Zusammenfassungen vorhanden' });
      return;
    }

    set({
      isIndexing: true,
      indexProgress: { current: 0, total: meetingsToIndex.length },
      indexingError: null,
    });

    try {
      const result = await indexMeetings(
        meetingsToIndex,
        config,
        (current, total) => {
          set({ indexProgress: { current, total } });
        }
      );

      // Refresh stats
      const stats = await getSearchStats();

      set({
        isIndexing: false,
        indexProgress: null,
        indexedVectorsCount: stats.indexedVectors,
        indexingError: result.errors.length > 0
          ? `${result.errors.length} Fehler beim Indexieren`
          : null,
      });

      logger.info(`Indexing complete: ${result.totalVectors} vectors created`);
    } catch (err) {
      set({
        isIndexing: false,
        indexProgress: null,
        indexingError: err instanceof Error ? err.message : 'Indexierung fehlgeschlagen',
      });
    }
  },

  // Index a single meeting
  indexSingleMeeting: async (meetingId: string) => {
    const { config, meetingMap } = get();

    if (!config) {
      set({ indexingError: 'Suchkonfiguration nicht gesetzt' });
      return;
    }

    const meeting = meetingMap.get(meetingId);
    if (!meeting) {
      set({ indexingError: 'Meeting nicht gefunden' });
      return;
    }

    set({ isIndexing: true, indexingError: null });

    try {
      const result = await indexMeeting(meeting, config);

      // Refresh stats
      const stats = await getSearchStats();

      set({
        isIndexing: false,
        indexedVectorsCount: stats.indexedVectors,
        indexingError: result.error || null,
      });
    } catch (err) {
      set({
        isIndexing: false,
        indexingError: err instanceof Error ? err.message : 'Indexierung fehlgeschlagen',
      });
    }
  },

  // Re-index a meeting (delete old vectors and re-index)
  reindexMeeting: async (meetingId: string) => {
    await deleteVectorsByMeetingId(meetingId);
    await get().indexSingleMeeting(meetingId);
  },

  // Set search configuration
  setConfig: (config: SearchConfig) => {
    set({ config });
    get().checkProvider();
  },

  // Check if embedding provider is available
  checkProvider: async () => {
    const { config } = get();

    if (!config) {
      set({ providerAvailable: false, providerError: 'Keine Konfiguration' });
      return;
    }

    try {
      const result = await checkEmbeddingAvailability(config);
      set({
        providerAvailable: result.available,
        providerError: result.error || null,
      });
    } catch (err) {
      set({
        providerAvailable: false,
        providerError: err instanceof Error ? err.message : 'Provider-Check fehlgeschlagen',
      });
    }
  },

  // Check if a specific meeting is indexed
  isMeetingIndexed: async (meetingId: string) => {
    return await isMeetingIndexed(meetingId);
  },

  // Clear errors
  clearError: () => {
    set({ searchError: null, indexingError: null });
  },
}));
