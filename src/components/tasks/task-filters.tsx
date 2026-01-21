'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import type { TaskFilters, TaskStatus, TaskPriority } from '@/types/task';
import type { TaskSortOptions, TaskSortField, TaskSortOrder, TaskGroupBy } from '@/lib/tasks/manager';

interface TaskFiltersProps {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  sortOptions: TaskSortOptions;
  onSortChange: (options: TaskSortOptions) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (groupBy: TaskGroupBy) => void;
  availableTags?: string[];
  availableAssignees?: { id?: string; name: string }[];
  showAdvanced?: boolean;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Ausstehend', color: 'text-amber-400' },
  { value: 'in-progress', label: 'In Bearbeitung', color: 'text-blue-400' },
  { value: 'completed', label: 'Abgeschlossen', color: 'text-green-400' },
  { value: 'cancelled', label: 'Abgebrochen', color: 'text-gray-400' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Dringend', color: 'text-red-400' },
  { value: 'high', label: 'Hoch', color: 'text-orange-400' },
  { value: 'medium', label: 'Mittel', color: 'text-yellow-400' },
  { value: 'low', label: 'Niedrig', color: 'text-gray-400' },
];

const SORT_OPTIONS: { value: TaskSortField; label: string }[] = [
  { value: 'createdAt', label: 'Erstellt' },
  { value: 'updatedAt', label: 'Aktualisiert' },
  { value: 'dueDate', label: 'Fälligkeitsdatum' },
  { value: 'priority', label: 'Priorität' },
  { value: 'status', label: 'Status' },
  { value: 'title', label: 'Titel' },
];

const GROUP_OPTIONS: { value: TaskGroupBy; label: string }[] = [
  { value: 'none', label: 'Keine Gruppierung' },
  { value: 'status', label: 'Nach Status' },
  { value: 'priority', label: 'Nach Priorität' },
  { value: 'assignee', label: 'Nach Person' },
  { value: 'meeting', label: 'Nach Meeting' },
  { value: 'dueDate', label: 'Nach Fälligkeit' },
];

export function TaskFiltersPanel({
  filters,
  onFiltersChange,
  sortOptions,
  onSortChange,
  groupBy,
  onGroupByChange,
  availableTags = [],
  availableAssignees = [],
  showAdvanced = true,
}: TaskFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.searchQuery || '');

  // Fix 11: Use ref to properly track and cleanup debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle search input with proper debounce cleanup
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);

      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounced update
      debounceTimerRef.current = setTimeout(() => {
        onFiltersChange({ ...filters, searchQuery: value || undefined });
      }, 300);
    },
    [filters, onFiltersChange]
  );

  // Toggle status filter
  const toggleStatus = (status: TaskStatus) => {
    const currentStatuses = Array.isArray(filters.status)
      ? filters.status
      : filters.status
      ? [filters.status]
      : [];

    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];

    onFiltersChange({
      ...filters,
      status: newStatuses.length > 0 ? newStatuses : undefined,
    });
  };

  // Toggle priority filter
  const togglePriority = (priority: TaskPriority) => {
    const currentPriorities = Array.isArray(filters.priority)
      ? filters.priority
      : filters.priority
      ? [filters.priority]
      : [];

    const newPriorities = currentPriorities.includes(priority)
      ? currentPriorities.filter((p) => p !== priority)
      : [...currentPriorities, priority];

    onFiltersChange({
      ...filters,
      priority: newPriorities.length > 0 ? newPriorities : undefined,
    });
  };

  // Toggle tag filter
  const toggleTag = (tag: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];

    onFiltersChange({
      ...filters,
      tags: newTags.length > 0 ? newTags : undefined,
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchInput('');
    onFiltersChange({});
  };

  // Check if any filters are active
  const hasActiveFilters =
    filters.status ||
    filters.priority ||
    filters.assigneeId ||
    filters.tags?.length ||
    filters.searchQuery ||
    filters.overdue;

  // Get current status selections
  const selectedStatuses = Array.isArray(filters.status)
    ? filters.status
    : filters.status
    ? [filters.status]
    : [];

  // Get current priority selections
  const selectedPriorities = Array.isArray(filters.priority)
    ? filters.priority
    : filters.priority
    ? [filters.priority]
    : [];

  return (
    <GlassCard variant="subtle" padding="md" className="mb-4">
      {/* Search and Quick Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Aufgaben suchen..."
            className="w-full px-4 py-2 pl-10 rounded-lg bg-background/50 border border-white/10
                     text-text-primary placeholder:text-text-tertiary focus:outline-none
                     focus:ring-2 focus:ring-primary/50"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={sortOptions.field}
            onChange={(e) =>
              onSortChange({ ...sortOptions, field: e.target.value as TaskSortField })
            }
            className="px-3 py-2 rounded-lg bg-background/50 border border-white/10
                     text-text-primary text-sm focus:outline-none focus:ring-2
                     focus:ring-primary/50"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              onSortChange({
                ...sortOptions,
                order: sortOptions.order === 'asc' ? 'desc' : 'asc',
              })
            }
            className="p-2 rounded-lg bg-background/50 border border-white/10
                     text-text-secondary hover:text-text-primary transition-colors"
            title={sortOptions.order === 'asc' ? 'Aufsteigend' : 'Absteigend'}
          >
            {sortOptions.order === 'asc' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>

        {/* Group By Dropdown */}
        <select
          value={groupBy}
          onChange={(e) => onGroupByChange(e.target.value as TaskGroupBy)}
          className="px-3 py-2 rounded-lg bg-background/50 border border-white/10
                   text-text-primary text-sm focus:outline-none focus:ring-2
                   focus:ring-primary/50"
        >
          {GROUP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Expand/Collapse Button */}
        {showAdvanced && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-background/50
                     border border-white/10 text-text-secondary hover:text-text-primary
                     transition-colors text-sm"
          >
            Filter
            <motion.svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </button>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-lg text-red-400 hover:bg-red-400/10
                     transition-colors text-sm"
          >
            Filter löschen
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
              {/* Status Filters */}
              <div>
                <label className="block text-sm text-text-secondary mb-2">Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleStatus(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        selectedStatuses.includes(option.value)
                          ? `bg-primary/20 ${option.color} border border-primary/50`
                          : 'bg-background/30 text-text-tertiary border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority Filters */}
              <div>
                <label className="block text-sm text-text-secondary mb-2">Priorität</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => togglePriority(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        selectedPriorities.includes(option.value)
                          ? `bg-primary/20 ${option.color} border border-primary/50`
                          : 'bg-background/30 text-text-tertiary border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee Filter */}
              {availableAssignees.length > 0 && (
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Person</label>
                  <select
                    value={filters.assigneeId || ''}
                    onChange={(e) =>
                      onFiltersChange({
                        ...filters,
                        assigneeId: e.target.value || undefined,
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-background/50 border border-white/10
                             text-text-primary text-sm focus:outline-none focus:ring-2
                             focus:ring-primary/50 min-w-[200px]"
                  >
                    <option value="">Alle Personen</option>
                    {availableAssignees.map((assignee) => (
                      <option key={assignee.id || assignee.name} value={assignee.id || assignee.name}>
                        {assignee.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tags Filter */}
              {availableTags.length > 0 && (
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          filters.tags?.includes(tag)
                            ? 'bg-primary/20 text-primary border border-primary/50'
                            : 'bg-background/30 text-text-tertiary border border-white/10 hover:border-white/20'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Filters */}
              <div className="flex flex-wrap gap-4">
                {/* Overdue Only */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.overdue || false}
                    onChange={(e) =>
                      onFiltersChange({
                        ...filters,
                        overdue: e.target.checked || undefined,
                      })
                    }
                    className="w-4 h-4 rounded border-white/20 bg-background/50
                             text-primary focus:ring-primary/50"
                  />
                  <span className="text-sm text-text-secondary">Nur überfällige</span>
                </label>

                {/* Has Due Date */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hasDueDate || false}
                    onChange={(e) =>
                      onFiltersChange({
                        ...filters,
                        hasDueDate: e.target.checked || undefined,
                      })
                    }
                    className="w-4 h-4 rounded border-white/20 bg-background/50
                             text-primary focus:ring-primary/50"
                  />
                  <span className="text-sm text-text-secondary">Mit Fälligkeitsdatum</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// Quick filter bar for compact view
export function TaskQuickFilters({
  filters,
  onFiltersChange,
}: {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
}) {
  const quickFilters = [
    { label: 'Alle', value: {} },
    { label: 'Ausstehend', value: { status: ['pending', 'in-progress'] as TaskStatus[] } },
    { label: 'Überfällig', value: { overdue: true } },
    { label: 'Abgeschlossen', value: { status: 'completed' as TaskStatus } },
    { label: 'Dringend', value: { priority: ['urgent', 'high'] as TaskPriority[] } },
  ];

  const isActive = (filterValue: TaskFilters) => {
    return JSON.stringify(filters) === JSON.stringify(filterValue);
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {quickFilters.map((filter) => (
        <button
          key={filter.label}
          onClick={() => onFiltersChange(filter.value)}
          className={`px-4 py-2 rounded-full text-sm transition-all ${
            isActive(filter.value)
              ? 'bg-primary text-white'
              : 'bg-background/50 text-text-secondary hover:text-text-primary border border-white/10'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
