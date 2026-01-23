'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Search,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  Database,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  Lightbulb,
  ListTodo,
  FileText,
} from 'lucide-react';
import { useSearchStore } from '@/lib/store/search-store';
import { useAppStore } from '@/lib/store/settings';
import { formatResultType, getResultTypeColor } from '@/lib/search/semantic-search';
import type { StoredVector } from '@/lib/search/vector-store';
import { GlassCard } from '@/components/ui/glass-card';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Type icon mapping
function TypeIcon({ type }: { type: StoredVector['type'] }) {
  switch (type) {
    case 'decision':
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'question':
      return <MessageSquare className="h-3.5 w-3.5" />;
    case 'keypoint':
      return <Lightbulb className="h-3.5 w-3.5" />;
    case 'task':
      return <ListTodo className="h-3.5 w-3.5" />;
    case 'summary_chunk':
      return <FileText className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const router = useRouter();
  const { settings } = useAppStore();
  const {
    query,
    results,
    isSearching,
    searchError,
    isIndexing,
    indexProgress,
    indexedVectorsCount,
    indexingError,
    providerAvailable,
    providerError,
    suggestedQueries,
    setQuery,
    search,
    clearSearch,
    loadMeetingsAndCheckIndex,
    indexAllMeetings,
    setConfig,
    checkProvider,
    clearError,
  } = useSearchStore();

  const [localQuery, setLocalQuery] = useState(query);
  const debouncedQuery = useDebounce(localQuery, 300);

  // Initialize on mount
  useEffect(() => {
    if (isOpen) {
      // Set config based on current settings
      setConfig({
        provider: settings.selectedProvider === 'ollama' ? 'ollama' : 'openai',
        apiKey: settings.openaiApiKey,
        baseUrl: settings.ollamaBaseUrl,
        topK: 10,
        minSimilarity: 0.3,
      });
      loadMeetingsAndCheckIndex();
    }
  }, [isOpen, settings.selectedProvider, settings.openaiApiKey, settings.ollamaBaseUrl]);

  // Trigger search on debounced query change
  useEffect(() => {
    if (debouncedQuery.trim()) {
      search(debouncedQuery);
    }
  }, [debouncedQuery, search]);

  const handleQueryChange = useCallback((value: string) => {
    setLocalQuery(value);
    if (!value.trim()) {
      clearSearch();
    }
  }, [clearSearch]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setLocalQuery(suggestion);
    setQuery(suggestion);
    search(suggestion);
  }, [setQuery, search]);

  const handleResultClick = useCallback((meetingId: string) => {
    router.push(`/meeting/room?id=${meetingId}`);
    onClose();
  }, [router, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="mx-auto mt-[10vh] w-full max-w-2xl px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard padding="none" className="overflow-hidden">
            {/* Search Header */}
            <div className="flex items-center gap-3 border-b border-foreground/10 p-4">
              <Search className="h-5 w-5 text-primary" />
              <input
                type="text"
                value={localQuery}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Suche in allen Meetings... (z.B. 'Was haben wir zu Budget entschieden?')"
                className="flex-1 bg-transparent text-foreground placeholder:text-foreground-secondary focus:outline-none"
                autoFocus
              />
              {localQuery && (
                <button
                  onClick={() => handleQueryChange('')}
                  className="text-foreground-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="text-foreground-secondary hover:text-foreground"
              >
                <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/10">ESC</span>
              </button>
            </div>

            {/* Provider Status */}
            {!providerAvailable && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{providerError || 'Embedding-Provider nicht verfügbar'}</span>
              </div>
            )}

            {/* Index Status & Actions */}
            <div className="flex items-center justify-between px-4 py-2 bg-foreground/5 border-b border-foreground/10">
              <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                <Database className="h-3.5 w-3.5" />
                <span>
                  {indexedVectorsCount > 0
                    ? `${indexedVectorsCount} Einträge indexiert`
                    : 'Index leer'}
                </span>
              </div>

              <button
                onClick={indexAllMeetings}
                disabled={isIndexing || !providerAvailable}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isIndexing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {indexProgress
                        ? `${indexProgress.current}/${indexProgress.total}`
                        : 'Indexiere...'}
                    </span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Alle indexieren</span>
                  </>
                )}
              </button>
            </div>

            {/* Error Display */}
            {(searchError || indexingError) && (
              <div className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{searchError || indexingError}</span>
                <button onClick={clearError} className="ml-auto">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Loading State */}
              {isSearching && (
                <div className="flex items-center justify-center py-8 gap-2 text-foreground-secondary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Suche...</span>
                </div>
              )}

              {/* Results */}
              {!isSearching && results.length > 0 && (
                <div className="py-2">
                  {results.map((result, index) => (
                    <motion.button
                      key={result.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleResultClick(result.meetingId)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-foreground/5 transition-colors"
                    >
                      {/* Type Badge */}
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getResultTypeColor(result.type)}`}>
                        <TypeIcon type={result.type} />
                        <span>{formatResultType(result.type)}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">
                          {result.text}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-foreground-secondary">
                          <span>{result.meetingTitle}</span>
                          <span>•</span>
                          <span>{format(result.meetingDate, 'dd. MMM yyyy', { locale: de })}</span>
                          <span className="ml-auto">
                            {Math.round(result.similarity * 100)}% Match
                          </span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="h-4 w-4 text-foreground-secondary opacity-0 group-hover:opacity-100" />
                    </motion.button>
                  ))}
                </div>
              )}

              {/* No Results */}
              {!isSearching && localQuery && results.length === 0 && !searchError && (
                <div className="py-12 text-center">
                  <Search className="h-8 w-8 mx-auto text-foreground-secondary mb-3 opacity-50" />
                  <p className="text-foreground-secondary">
                    Keine Ergebnisse für "{localQuery}"
                  </p>
                  <p className="text-xs text-foreground-secondary mt-1">
                    Versuchen Sie einen anderen Suchbegriff
                  </p>
                </div>
              )}

              {/* Suggestions (when no query) */}
              {!localQuery && !isSearching && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3 text-xs text-foreground-secondary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Suchvorschläge</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedQueries.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 text-foreground-secondary hover:bg-foreground/10 hover:text-foreground transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  {indexedVectorsCount === 0 && (
                    <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
                      <div className="flex items-center gap-2 text-primary mb-2">
                        <Database className="h-4 w-4" />
                        <span className="text-sm font-medium">Index erstellen</span>
                      </div>
                      <p className="text-xs text-foreground-secondary mb-3">
                        Um die semantische Suche zu nutzen, müssen Ihre Meetings zuerst indexiert werden.
                      </p>
                      <button
                        onClick={indexAllMeetings}
                        disabled={isIndexing || !providerAvailable}
                        className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isIndexing ? 'Indexiere...' : 'Jetzt indexieren'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-foreground/10 bg-foreground/5 text-xs text-foreground-secondary">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 mr-1">↑↓</kbd>
                Navigieren
                <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 ml-2 mr-1">↵</kbd>
                Öffnen
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Cross-Meeting Intelligence
              </span>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Compact search trigger button for header
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-foreground-secondary hover:text-foreground transition-colors"
    >
      <Search className="h-4 w-4" />
      <span className="text-xs hidden sm:inline">Suche</span>
      <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-foreground/10 text-[10px]">⌘K</kbd>
    </button>
  );
}
