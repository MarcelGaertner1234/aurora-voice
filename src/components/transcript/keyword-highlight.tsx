'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  CheckCircle,
  ListTodo,
  CircleDollarSign,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  detectKeywords,
  highlightText,
  DEFAULT_KEYWORD_CATEGORIES,
  type KeywordCategory,
  type KeywordMatch,
  type HighlightedSegment,
} from '@/lib/meetings/live';

// Icon mapping
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deadline: Clock,
  decision: CheckCircle,
  action: ListTodo,
  budget: CircleDollarSign,
  question: HelpCircle,
  risk: AlertTriangle,
};

interface KeywordHighlightProps {
  text: string;
  categories?: KeywordCategory[];
  showTooltips?: boolean;
  animate?: boolean;
  className?: string;
}

export const KeywordHighlight = memo(function KeywordHighlight({
  text,
  categories = DEFAULT_KEYWORD_CATEGORIES,
  showTooltips = true,
  animate = true,
  className = '',
}: KeywordHighlightProps) {
  // Detect and highlight keywords
  const { segments, matches } = useMemo(() => {
    const matches = detectKeywords(text, categories);
    const segments = highlightText(text, matches, categories);
    return { segments, matches };
  }, [text, categories]);

  if (matches.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <HighlightedSpan
          key={index}
          segment={segment}
          categories={categories}
          showTooltip={showTooltips}
          animate={animate}
        />
      ))}
    </span>
  );
});

// Individual highlighted span
interface HighlightedSpanProps {
  segment: HighlightedSegment;
  categories: KeywordCategory[];
  showTooltip: boolean;
  animate: boolean;
}

const HighlightedSpan = memo(function HighlightedSpan({
  segment,
  categories,
  showTooltip,
  animate,
}: HighlightedSpanProps) {
  if (!segment.isHighlighted) {
    return <span>{segment.text}</span>;
  }

  const category = categories.find(c => c.id === segment.categoryId);
  const Icon = segment.categoryId ? CATEGORY_ICONS[segment.categoryId] : null;

  const content = (
    <span
      className="relative inline-flex items-center gap-0.5 rounded px-0.5 font-medium"
      style={{
        backgroundColor: `${segment.color}20`,
        color: segment.color,
      }}
    >
      {Icon && <Icon className="inline h-3 w-3" />}
      {segment.text}
    </span>
  );

  if (animate) {
    return (
      <motion.span
        initial={{ backgroundColor: `${segment.color}40` }}
        animate={{ backgroundColor: `${segment.color}20` }}
        transition={{ duration: 0.5 }}
        className="relative inline-flex items-center gap-0.5 rounded px-0.5 font-medium"
        style={{ color: segment.color }}
        title={showTooltip ? category?.label : undefined}
      >
        {Icon && <Icon className="inline h-3 w-3" />}
        {segment.text}
      </motion.span>
    );
  }

  if (showTooltip && category) {
    return (
      <span title={category.label}>
        {content}
      </span>
    );
  }

  return content;
});

// Keyword badge for sidebar/stats
interface KeywordBadgeProps {
  category: KeywordCategory;
  count: number;
  onClick?: () => void;
  isActive?: boolean;
}

export function KeywordBadge({ category, count, onClick, isActive }: KeywordBadgeProps) {
  const Icon = CATEGORY_ICONS[category.id];

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
        isActive ? 'ring-2 ring-offset-2' : ''
      }`}
      style={{
        backgroundColor: `${category.color}20`,
        color: category.color,
        ...(isActive && { ringColor: category.color }),
      }}
    >
      {Icon && <Icon className="h-3 w-3" />}
      <span>{category.label}</span>
      <span
        className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]"
        style={{ backgroundColor: `${category.color}30` }}
      >
        {count}
      </span>
    </button>
  );
}

// Keyword filter bar
interface KeywordFilterBarProps {
  categories?: KeywordCategory[];
  counts: Record<string, number>;
  activeCategories: string[];
  onToggleCategory: (categoryId: string) => void;
}

export function KeywordFilterBar({
  categories = DEFAULT_KEYWORD_CATEGORIES,
  counts,
  activeCategories,
  onToggleCategory,
}: KeywordFilterBarProps) {
  const categoriesWithCounts = categories.filter(c => counts[c.id] > 0);

  if (categoriesWithCounts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {categoriesWithCounts.map(category => (
        <KeywordBadge
          key={category.id}
          category={category}
          count={counts[category.id]}
          isActive={activeCategories.includes(category.id)}
          onClick={() => onToggleCategory(category.id)}
        />
      ))}
    </div>
  );
}

// Keyword legend for reference
interface KeywordLegendProps {
  categories?: KeywordCategory[];
  compact?: boolean;
}

export function KeywordLegend({ categories = DEFAULT_KEYWORD_CATEGORIES, compact = false }: KeywordLegendProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        {categories.map(category => {
          const Icon = CATEGORY_ICONS[category.id];
          return (
            <span
              key={category.id}
              className="inline-flex items-center gap-1"
              style={{ color: category.color }}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {category.label}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground-secondary">Keyword-Kategorien</h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {categories.map(category => {
          const Icon = CATEGORY_ICONS[category.id];
          return (
            <div
              key={category.id}
              className="flex items-center gap-2 rounded-md p-2"
              style={{ backgroundColor: `${category.color}10` }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: `${category.color}20`, color: category.color }}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
              </span>
              <div>
                <span className="font-medium" style={{ color: category.color }}>
                  {category.label}
                </span>
                <div className="text-[10px] text-foreground-secondary">
                  {category.keywords.slice(0, 3).join(', ')}...
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
