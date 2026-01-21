'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatAbsoluteTimestamp, formatElapsedTime } from '@/lib/meetings/engine';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Volume2,
  MessageSquare,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { SpeakerLabel } from './speaker-label';
import { KeywordHighlight, KeywordFilterBar } from './keyword-highlight';
import { GlassCard } from '@/components/ui/glass-card';
import type { TranscriptSegment } from '@/types/meeting';
import type { SpeakerProfile } from '@/types/speaker';
import type {
  DetectedDecision,
  DetectedQuestion,
  KeywordCategory,
  KeywordMatch,
} from '@/lib/meetings/live';
import { DEFAULT_KEYWORD_CATEGORIES } from '@/lib/meetings/live';

interface LiveTranscriptProps {
  meetingStart: Date;
  segments: TranscriptSegment[];
  speakers: SpeakerProfile[];
  keywordMatches: Map<string, KeywordMatch[]>;
  categories?: KeywordCategory[];
  decisions: DetectedDecision[];
  questions: DetectedQuestion[];
  isRecording: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  audioLevel: number;
  isSpeaking: boolean;
  duration: number;
  onSpeakerAssign?: (segmentId: string, speakerId: string) => void;
  onSpeakerCreate?: (name: string) => Promise<SpeakerProfile>;
  autoScroll?: boolean;
  showTimestamps?: boolean;
  showKeywords?: boolean;
  showDecisions?: boolean;
  showQuestions?: boolean;
  compact?: boolean;
}

export const LiveTranscript = memo(function LiveTranscript({
  meetingStart,
  segments,
  speakers,
  keywordMatches,
  categories = DEFAULT_KEYWORD_CATEGORIES,
  decisions,
  questions,
  isRecording,
  isPaused,
  isProcessing,
  audioLevel,
  isSpeaking,
  duration,
  onSpeakerAssign,
  onSpeakerCreate,
  autoScroll = true,
  showTimestamps = true,
  showKeywords = true,
  showDecisions = true,
  showQuestions = true,
  compact = false,
}: LiveTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Fix 12: Define max segments limit to prevent memory issues
  const MAX_VISIBLE_SEGMENTS = 500;

  // Auto-scroll to bottom when new segments arrive
  // Fix 12: Use segments.length instead of segments to prevent unnecessary re-renders
  useEffect(() => {
    if (autoScroll && isAtBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [segments.length, autoScroll, isAtBottom]);

  // Track scroll position
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
  };

  // Toggle category filter
  const toggleCategory = (categoryId: string) => {
    setActiveCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Fix 12: Trim segments to prevent memory issues with very long recordings
  const visibleSegments = useMemo(() => {
    if (segments.length <= MAX_VISIBLE_SEGMENTS) {
      return segments;
    }
    // Keep only the most recent segments
    return segments.slice(-MAX_VISIBLE_SEGMENTS);
  }, [segments, MAX_VISIBLE_SEGMENTS]);

  // Calculate keyword counts
  const keywordCounts: Record<string, number> = {};
  for (const category of categories) {
    keywordCounts[category.id] = 0;
    for (const matches of keywordMatches.values()) {
      keywordCounts[category.id] += matches.filter(m => m.categoryId === category.id).length;
    }
  }

  // Scroll to bottom button
  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Recording status bar */}
      <div className="flex items-center justify-between border-b border-foreground/5 px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Recording indicator */}
          <div className="flex items-center gap-2">
            {isRecording ? (
              <motion.div
                animate={{ scale: isSpeaking ? [1, 1.2, 1] : 1 }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  isPaused ? 'bg-amber-500/20 text-amber-500' : 'bg-success/20 text-success'
                }`}
              >
                {isPaused ? <Pause className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </motion.div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground-secondary">
                <MicOff className="h-4 w-4" />
              </div>
            )}
            <div className="text-sm">
              <span className="font-medium text-foreground">{formatElapsedTime(duration)}</span>
              {isProcessing && (
                <span className="ml-2 text-foreground-secondary">
                  <Loader2 className="inline h-3 w-3 animate-spin" /> Verarbeite...
                </span>
              )}
            </div>
          </div>

          {/* Audio level indicator */}
          {isRecording && !isPaused && (
            <div className="flex items-center gap-1">
              <Volume2 className="h-3.5 w-3.5 text-foreground-secondary" />
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10">
                <motion.div
                  className="h-full bg-primary"
                  style={{ width: `${audioLevel * 100}%` }}
                  transition={{ duration: 0.05 }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-foreground-secondary">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {segments.length} Segmente
          </span>
          {showDecisions && decisions.length > 0 && (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle className="h-3.5 w-3.5" />
              {decisions.length} Entscheidungen
            </span>
          )}
          {showQuestions && questions.filter(q => !q.isRhetorical).length > 0 && (
            <span className="flex items-center gap-1 text-violet-500">
              <HelpCircle className="h-3.5 w-3.5" />
              {questions.filter(q => !q.isRhetorical).length} Fragen
            </span>
          )}
        </div>
      </div>

      {/* Keyword filter */}
      {showKeywords && Object.values(keywordCounts).some(c => c > 0) && (
        <div className="border-b border-foreground/5 px-4 py-2">
          <KeywordFilterBar
            categories={categories}
            counts={keywordCounts}
            activeCategories={activeCategories}
            onToggleCategory={toggleCategory}
          />
        </div>
      )}

      {/* Transcript content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {visibleSegments.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="text-foreground-secondary">
              {isRecording ? (
                <>
                  <Mic className="mx-auto mb-2 h-8 w-8 animate-pulse" />
                  <p>Aufnahme läuft...</p>
                  <p className="text-xs">Sprechen Sie, um die Transkription zu starten</p>
                </>
              ) : (
                <>
                  <MicOff className="mx-auto mb-2 h-8 w-8" />
                  <p>Keine Transkription</p>
                  <p className="text-xs">Starten Sie die Aufnahme, um zu beginnen</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Fix 12: Show indicator if segments were trimmed */}
            {segments.length > MAX_VISIBLE_SEGMENTS && (
              <div className="text-center text-xs text-foreground-secondary py-2 bg-foreground/5 rounded">
                {segments.length - MAX_VISIBLE_SEGMENTS} ältere Segmente ausgeblendet
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {visibleSegments.map((segment, index) => {
                const segmentId = `segment-${segment.startTime}`;
                const matches = keywordMatches.get(segmentId) || [];
                const filteredMatches = activeCategories.length > 0
                  ? matches.filter(m => activeCategories.includes(m.categoryId))
                  : matches;

                // Skip segments that don't match active filters
                if (activeCategories.length > 0 && filteredMatches.length === 0) {
                  return null;
                }

                return (
                  <TranscriptSegmentItem
                    key={segment.id || index}
                    segment={segment}
                    speakers={speakers}
                    meetingStart={meetingStart}
                    matches={showKeywords ? filteredMatches : []}
                    categories={categories}
                    showTimestamp={showTimestamps}
                    compact={compact}
                    isLatest={index === visibleSegments.length - 1}
                    onSpeakerAssign={onSpeakerAssign}
                    onSpeakerCreate={onSpeakerCreate}
                  />
                );
              })}
            </AnimatePresence>

            {/* Processing indicator */}
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm text-foreground-secondary"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Transkribiere...</span>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {!isAtBottom && visibleSegments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2"
          >
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm text-white shadow-lg transition-colors hover:bg-primary/90"
            >
              <ChevronDown className="h-4 w-4" />
              Zum Ende
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Individual transcript segment
interface TranscriptSegmentItemProps {
  segment: TranscriptSegment;
  speakers: SpeakerProfile[];
  meetingStart: Date;
  matches: KeywordMatch[];
  categories: KeywordCategory[];
  showTimestamp: boolean;
  compact: boolean;
  isLatest: boolean;
  onSpeakerAssign?: (segmentId: string, speakerId: string) => void;
  onSpeakerCreate?: (name: string) => Promise<SpeakerProfile>;
}

const TranscriptSegmentItem = memo(function TranscriptSegmentItem({
  segment,
  speakers,
  meetingStart,
  matches,
  categories,
  showTimestamp,
  compact,
  isLatest,
}: TranscriptSegmentItemProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`group ${compact ? '' : 'rounded-lg bg-foreground/[0.02] p-3'}`}
    >
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        {showTimestamp && (
          <span className="flex-shrink-0 pt-0.5 text-xs tabular-nums text-foreground-secondary">
            {formatAbsoluteTimestamp(meetingStart, segment.startTime)}
          </span>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Speaker */}
          <div className="mb-1 flex items-center gap-2">
            <SpeakerLabel
              speakerId={segment.speakerId}
              suggestedSpeakerId={segment.suggestedSpeakerId}
              speakers={speakers}
              confirmed={segment.confirmed ?? false}
              size="sm"
            />
            {segment.confidence !== undefined && segment.confidence < 0.7 && (
              <span className="text-[10px] text-foreground-secondary/60">
                (unsicher)
              </span>
            )}
          </div>

          {/* Text with highlights */}
          <div className={`text-sm text-foreground ${isLatest ? 'font-medium' : ''}`}>
            {matches.length > 0 ? (
              <KeywordHighlight
                text={segment.text}
                categories={categories}
                animate={isLatest}
              />
            ) : (
              segment.text
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// Sidebar panels for decisions and questions
interface DecisionsPanelProps {
  decisions: DetectedDecision[];
  speakers: SpeakerProfile[];
  meetingStart: Date;
}

export function DecisionsPanel({ decisions, speakers, meetingStart }: DecisionsPanelProps) {
  if (decisions.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-foreground-secondary">
        <CheckCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Keine Entscheidungen erkannt</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {decisions.map((decision, index) => {
        const speaker = decision.speakerId
          ? speakers.find(s => s.id === decision.speakerId)
          : null;

        return (
          <GlassCard key={index} variant="subtle" className="text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
              <div>
                <p className="font-medium text-foreground">{decision.text}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-foreground-secondary">
                  <span>{formatAbsoluteTimestamp(meetingStart, decision.timestamp)}</span>
                  {speaker && <span>von {speaker.name}</span>}
                  <span className="opacity-60">
                    {Math.round(decision.confidence * 100)}% sicher
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

interface QuestionsPanelProps {
  questions: DetectedQuestion[];
  speakers: SpeakerProfile[];
  meetingStart: Date;
}

export function QuestionsPanel({ questions, speakers, meetingStart }: QuestionsPanelProps) {
  const openQuestions = questions.filter(q => !q.isRhetorical);

  if (openQuestions.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-foreground-secondary">
        <HelpCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Keine offenen Fragen</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {openQuestions.map((question, index) => {
        const speaker = question.speakerId
          ? speakers.find(s => s.id === question.speakerId)
          : null;

        return (
          <GlassCard key={index} variant="subtle" className="text-sm">
            <div className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" />
              <div>
                <p className="font-medium text-foreground">{question.text}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-foreground-secondary">
                  <span>{formatAbsoluteTimestamp(meetingStart, question.timestamp)}</span>
                  {speaker && <span>von {speaker.name}</span>}
                </div>
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
