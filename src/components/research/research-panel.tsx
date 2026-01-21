'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Globe,
  FileText,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  X,
  Loader2,
  Lightbulb,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { useResearch } from '@/hooks/use-research';
import type {
  ResearchResult,
  ResearchSuggestion,
  WebSearchResult,
  DocumentSearchResult,
  FactCheckResult,
} from '@/types/research';

interface ResearchPanelProps {
  meetingId?: string;
  transcript?: string;
  onClose?: () => void;
  compact?: boolean;
}

export const ResearchPanel = memo(function ResearchPanel({
  meetingId,
  transcript,
  onClose,
  compact = false,
}: ResearchPanelProps) {
  const {
    isSearching,
    error,
    results,
    suggestions,
    queryHistory,
    search,
    generateSuggestions,
    dismissSuggestion,
    acceptSuggestion,
    clearResults,
  } = useResearch({ meetingId });

  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'web' | 'document'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate suggestions when transcript changes
  useEffect(() => {
    if (transcript) {
      generateSuggestions(transcript);
    }
  }, [transcript, generateSuggestions]);

  // Handle search submission
  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!query.trim() || isSearching) return;
      await search(query.trim(), searchType);
      setQuery('');
    },
    [query, searchType, isSearching, search]
  );

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    async (suggestion: ResearchSuggestion) => {
      await acceptSuggestion(suggestion.id);
    },
    [acceptSuggestion]
  );

  // Handle history item click
  const handleHistoryClick = useCallback(
    (historyQuery: string) => {
      setQuery(historyQuery);
      setShowHistory(false);
      inputRef.current?.focus();
    },
    []
  );

  return (
    <div className={`flex h-full flex-col ${compact ? '' : 'min-h-[400px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="font-medium text-foreground">Recherche</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full p-1 text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="border-b border-foreground/5 p-4">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => queryHistory.length > 0 && setShowHistory(true)}
            placeholder="Recherchieren..."
            className="w-full rounded-lg bg-background-secondary pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-secondary" />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          )}
        </div>

        {/* Search Type Selector */}
        <div className="mt-2 flex gap-2">
          {(['all', 'web', 'document'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSearchType(type)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                searchType === type
                  ? 'bg-primary text-white'
                  : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
              }`}
            >
              {type === 'all' && <Sparkles className="h-3 w-3" />}
              {type === 'web' && <Globe className="h-3 w-3" />}
              {type === 'document' && <FileText className="h-3 w-3" />}
              {type === 'all' && 'Alle'}
              {type === 'web' && 'Web'}
              {type === 'document' && 'Dokumente'}
            </button>
          ))}
        </div>

        {/* History Dropdown */}
        <AnimatePresence>
          {showHistory && queryHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-10 mt-1 w-full rounded-lg border border-foreground/10 bg-background shadow-lg"
            >
              <div className="flex items-center justify-between px-3 py-2 text-xs text-foreground-secondary">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Letzte Suchen
                </span>
                <button
                  onClick={() => setShowHistory(false)}
                  className="hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {queryHistory.slice(0, 5).map((historyQuery, index) => (
                  <button
                    key={index}
                    onClick={() => handleHistoryClick(historyQuery)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                  >
                    <Search className="h-3 w-3 text-foreground-secondary" />
                    {historyQuery}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="border-b border-foreground/5 px-4 py-3">
          <div className="mb-2 flex items-center gap-1 text-xs text-foreground-secondary">
            <Lightbulb className="h-3 w-3" />
            Vorschläge
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 3).map((suggestion) => (
              <SuggestionBadge
                key={suggestion.id}
                suggestion={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                onDismiss={() => dismissSuggestion(suggestion.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 rounded-lg bg-error/10 p-3 text-sm text-error">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-foreground-secondary">
            <div>
              <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">Starte eine Recherche</p>
              <p className="text-xs">Suche im Web oder in lokalen Dokumenten</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <ResearchResultCard key={result.id} result={result} compact={compact} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {results.length > 0 && (
        <div className="border-t border-foreground/5 px-4 py-2">
          <button
            onClick={clearResults}
            className="text-xs text-foreground-secondary hover:text-foreground"
          >
            Ergebnisse löschen
          </button>
        </div>
      )}
    </div>
  );
});

// Suggestion Badge Component
interface SuggestionBadgeProps {
  suggestion: ResearchSuggestion;
  onClick: () => void;
  onDismiss: () => void;
}

const SuggestionBadge = memo(function SuggestionBadge({
  suggestion,
  onClick,
  onDismiss,
}: SuggestionBadgeProps) {
  const priorityColors = {
    high: 'bg-primary/10 text-primary border-primary/20',
    medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    low: 'bg-foreground/10 text-foreground-secondary border-foreground/20',
  };

  return (
    <div
      className={`group flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${priorityColors[suggestion.priority]}`}
    >
      <button onClick={onClick} className="flex items-center gap-1 hover:underline">
        <Lightbulb className="h-3 w-3" />
        {suggestion.query.slice(0, 30)}
        {suggestion.query.length > 30 && '...'}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="ml-1 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
});

// Research Result Card Component
interface ResearchResultCardProps {
  result: ResearchResult;
  compact?: boolean;
}

const ResearchResultCard = memo(function ResearchResultCard({
  result,
  compact = false,
}: ResearchResultCardProps) {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <GlassCard variant="subtle">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="font-medium text-foreground">{result.query}</p>
          <p className="text-xs text-foreground-secondary">
            {result.webResults.length} Web • {result.documentResults.length} Dokumente
            {result.cached && ' • aus Cache'}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-foreground-secondary" />
        ) : (
          <ChevronDown className="h-4 w-4 text-foreground-secondary" />
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Summary */}
            {result.summary && (
              <div className="mt-3 rounded-lg bg-primary/5 p-3 text-sm text-foreground">
                <div className="prose prose-sm max-w-none">
                  {result.summary.split('\n').map((line, i) => (
                    <p key={i} className="mb-1 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Fact Check */}
            {result.factCheck && <FactCheckCard factCheck={result.factCheck} />}

            {/* Web Results */}
            {result.webResults.length > 0 && (
              <div className="mt-3">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-foreground-secondary">
                  <Globe className="h-3 w-3" />
                  Web-Ergebnisse
                </h4>
                <div className="space-y-2">
                  {result.webResults.slice(0, 3).map((webResult) => (
                    <WebResultItem key={webResult.id} result={webResult} />
                  ))}
                </div>
              </div>
            )}

            {/* Document Results */}
            {result.documentResults.length > 0 && (
              <div className="mt-3">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-foreground-secondary">
                  <FileText className="h-3 w-3" />
                  Dokumente
                </h4>
                <div className="space-y-2">
                  {result.documentResults.slice(0, 3).map((docResult) => (
                    <DocumentResultItem key={docResult.id} result={docResult} />
                  ))}
                </div>
              </div>
            )}

            {/* Processing Time */}
            <p className="mt-3 text-[10px] text-foreground-secondary/60">
              Verarbeitet in {result.processingTime}ms
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
});

// Web Result Item
interface WebResultItemProps {
  result: WebSearchResult;
}

const WebResultItem = memo(function WebResultItem({ result }: WebResultItemProps) {
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg bg-foreground/[0.02] p-2 text-sm transition-colors hover:bg-foreground/5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-primary">{result.title}</p>
          <p className="line-clamp-2 text-xs text-foreground-secondary">{result.snippet}</p>
          <p className="mt-1 text-[10px] text-foreground-secondary/60">{result.source}</p>
        </div>
        <ExternalLink className="h-3 w-3 flex-shrink-0 text-foreground-secondary" />
      </div>
    </a>
  );
});

// Document Result Item
interface DocumentResultItemProps {
  result: DocumentSearchResult;
}

const DocumentResultItem = memo(function DocumentResultItem({
  result,
}: DocumentResultItemProps) {
  return (
    <div className="rounded-lg bg-foreground/[0.02] p-2 text-sm">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground-secondary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{result.filename}</p>
          <p className="line-clamp-2 text-xs text-foreground-secondary">
            {result.matchedText}
          </p>
          {result.lineNumber && (
            <p className="mt-1 text-[10px] text-foreground-secondary/60">
              Zeile {result.lineNumber}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

// Fact Check Card
interface FactCheckCardProps {
  factCheck: FactCheckResult;
}

const FactCheckCard = memo(function FactCheckCard({ factCheck }: FactCheckCardProps) {
  const verdictConfig = {
    true: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Bestätigt' },
    false: { icon: X, color: 'text-error', bg: 'bg-error/10', label: 'Widerlegt' },
    partially_true: {
      icon: HelpCircle,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      label: 'Teilweise wahr',
    },
    unverified: {
      icon: HelpCircle,
      color: 'text-foreground-secondary',
      bg: 'bg-foreground/10',
      label: 'Nicht verifiziert',
    },
    disputed: {
      icon: AlertTriangle,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      label: 'Umstritten',
    },
  };

  const config = verdictConfig[factCheck.verdict];
  const Icon = config.icon;

  return (
    <div className={`mt-3 rounded-lg ${config.bg} p-3`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 flex-shrink-0 ${config.color}`} />
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
            <span className="text-xs text-foreground-secondary">
              ({Math.round(factCheck.confidence * 100)}% sicher)
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground-secondary">{factCheck.explanation}</p>
        </div>
      </div>
    </div>
  );
});

// Compact Research Button (for embedding in other views)
interface ResearchButtonProps {
  onSearch: (query: string) => void;
  isSearching?: boolean;
}

export const ResearchButton = memo(function ResearchButton({
  onSearch,
  isSearching = false,
}: ResearchButtonProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setQuery('');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
          isOpen
            ? 'bg-primary text-white'
            : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
        }`}
      >
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        Recherche
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full z-50 mt-2 w-72"
          >
            <GlassCard>
              <form onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Recherchieren..."
                  className="w-full rounded-lg bg-background-secondary px-3 py-2 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </form>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
