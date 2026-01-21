'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { researchEngine, ResearchEngine, type ResearchEventCallback } from '@/lib/research/engine';
import type {
  ResearchResult,
  ResearchSuggestion,
  ResearchEvent,
  WebSearchResult,
  DocumentSearchResult,
  ResearchSettings,
} from '@/types/research';

export interface UseResearchOptions {
  meetingId?: string;
  autoSuggest?: boolean;
  onEvent?: ResearchEventCallback;
}

export interface UseResearchState {
  // Current search state
  isSearching: boolean;
  currentQuery: string | null;
  error: string | null;

  // Results
  results: ResearchResult[];
  suggestions: ResearchSuggestion[];

  // History
  queryHistory: string[];
}

export function useResearch(options: UseResearchOptions = {}) {
  const { meetingId, autoSuggest = true, onEvent } = options;

  // State
  const [isSearching, setIsSearching] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<ResearchSuggestion[]>([]);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  // Refs
  const eventCallbackRef = useRef(onEvent);
  eventCallbackRef.current = onEvent;
  const engineRef = useRef<ResearchEngine | null>(null);

  // Set up event listener and engine instance
  useEffect(() => {
    const handleEvent = (event: ResearchEvent) => {
      eventCallbackRef.current?.(event);

      // Handle specific events
      if (event.type === 'error') {
        const errorData = event.data as { source: string; error: string };
        setError(`${errorData.source}: ${errorData.error}`);
      }
    };

    // Create engine instance with event handler
    engineRef.current = new ResearchEngine({
      onEvent: handleEvent,
    });

    // Fix 4: Proper cleanup on unmount
    return () => {
      // Clear engine reference to allow garbage collection
      engineRef.current = null;
    };
  }, []);

  // Main search function
  const search = useCallback(
    async (
      query: string,
      type: 'web' | 'document' | 'fact_check' | 'all' = 'all'
    ): Promise<ResearchResult | null> => {
      if (!query.trim()) return null;

      setIsSearching(true);
      setCurrentQuery(query);
      setError(null);

      try {
        const result = await researchEngine.research(query, {
          type,
          meetingId,
        });

        setResults((prev) => [result, ...prev]);
        setQueryHistory((prev) => {
          if (prev[0] !== query) {
            return [query, ...prev.slice(0, 19)]; // Keep last 20 queries
          }
          return prev;
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Search failed';
        setError(errorMessage);
        return null;
      } finally {
        setIsSearching(false);
        setCurrentQuery(null);
      }
    },
    [meetingId]
  );

  // Quick web search
  const webSearch = useCallback(
    async (query: string): Promise<WebSearchResult[]> => {
      if (!query.trim()) return [];

      setIsSearching(true);
      setError(null);

      try {
        const webResults = await researchEngine.webSearch(query);
        return webResults;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Web search failed';
        setError(errorMessage);
        return [];
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Quick document search
  const documentSearch = useCallback(
    (query: string): DocumentSearchResult[] => {
      if (!query.trim()) return [];

      try {
        return researchEngine.documentSearch(query);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Document search failed';
        setError(errorMessage);
        return [];
      }
    },
    []
  );

  // Generate suggestions from transcript
  const generateSuggestions = useCallback(
    (transcript: string) => {
      if (!autoSuggest) return;

      const newSuggestions = researchEngine.generateSuggestions(
        transcript,
        queryHistory
      );
      setSuggestions(newSuggestions);
    },
    [autoSuggest, queryHistory]
  );

  // Dismiss a suggestion
  const dismissSuggestion = useCallback((suggestionId: string) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId ? { ...s, dismissed: true } : s
      )
    );
  }, []);

  // Accept a suggestion and perform search
  const acceptSuggestion = useCallback(
    async (suggestionId: string) => {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (suggestion) {
        dismissSuggestion(suggestionId);
        return search(suggestion.query);
      }
      return null;
    },
    [suggestions, dismissSuggestion, search]
  );

  // Clear results
  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  // Clear suggestions
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setQueryHistory([]);
  }, []);

  // Get session history
  const getSessionHistory = useCallback((): ResearchResult[] => {
    if (!meetingId) return [];
    return researchEngine.getSessionHistory(meetingId);
  }, [meetingId]);

  // Update settings
  const updateSettings = useCallback((settings: Partial<ResearchSettings>) => {
    researchEngine.updateSettings(settings);
  }, []);

  // Get active suggestions (not dismissed)
  const activeSuggestions = suggestions.filter((s) => !s.dismissed);

  return {
    // State
    isSearching,
    currentQuery,
    error,
    results,
    suggestions: activeSuggestions,
    queryHistory,

    // Actions
    search,
    webSearch,
    documentSearch,
    generateSuggestions,
    dismissSuggestion,
    acceptSuggestion,
    clearResults,
    clearSuggestions,
    clearHistory,
    getSessionHistory,
    updateSettings,
  };
}

export type UseResearchReturn = ReturnType<typeof useResearch>;
