'use client';

import { useCallback, useRef, useState } from 'react';
import type { Settings } from '@/types';
import type { SpeakerProfile } from '@/types/speaker';
import type { TranscriptSegment } from '@/types/meeting';
import {
  quickDetectSpeakerHints,
  findBestMatchWithLearning,
  matchSpeaker,
} from '@/lib/diarization';

export interface DiarizationResult {
  segmentId: string;
  suggestedSpeakerId: string | null;
  confidence: number;
  reason: 'name_match' | 'context_match' | 'pattern_match' | 'no_match';
}

export interface UseLiveDiarizationOptions {
  /** All available speakers */
  speakers: SpeakerProfile[];
  /** Meeting participant IDs (get priority in matching) */
  meetingParticipantIds?: string[];
  /** App settings */
  settings: Settings;
  /** Enable/disable diarization */
  enabled?: boolean;
  /** Minimum confidence threshold (default: 0.6) */
  confidenceThreshold?: number;
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number;
}

interface ProcessingQueueItem {
  segment: TranscriptSegment;
  resolve: (result: DiarizationResult | null) => void;
}

/**
 * Hook for live speaker diarization during meeting transcription.
 * Processes transcript segments and suggests speaker assignments.
 */
export function useLiveDiarization(options: UseLiveDiarizationOptions) {
  const {
    speakers,
    meetingParticipantIds,
    settings,
    enabled = true,
    confidenceThreshold = 0.6,
    debounceMs = 500,
  } = options;

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  // Refs for queue management
  const queueRef = useRef<ProcessingQueueItem[]>([]);
  const processingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get participant names for context
  const participantNames = speakers
    .filter(s => meetingParticipantIds?.includes(s.id))
    .map(s => s.name);

  /**
   * Process a single segment and return speaker suggestion
   */
  const processSegmentInternal = useCallback(
    async (segment: TranscriptSegment): Promise<DiarizationResult> => {
      // Quick detection: Look for speaker hints in text
      const hints = quickDetectSpeakerHints(segment.text);

      let bestMatch: { speakerId: string; confidence: number; reason: DiarizationResult['reason'] } | null = null;

      // Try to match detected names to speakers
      for (const hint of hints) {
        // First try with participant prioritization
        const participantMatch = matchSpeaker(hint, speakers, meetingParticipantIds);
        if (participantMatch && participantMatch.confidence >= confidenceThreshold) {
          bestMatch = {
            speakerId: participantMatch.speakerId,
            confidence: participantMatch.confidence,
            reason: 'name_match',
          };
          break;
        }

        // Fall back to learning-enhanced matching
        const learningMatch = findBestMatchWithLearning(hint, speakers, confidenceThreshold);
        if (learningMatch && (!bestMatch || learningMatch.confidence > bestMatch.confidence)) {
          bestMatch = {
            speakerId: learningMatch.speakerId,
            confidence: learningMatch.confidence,
            reason: learningMatch.matchReason === 'user_assigned' ? 'context_match' : 'name_match',
          };
        }
      }

      // If no name hints found, try pattern-based detection
      if (!bestMatch && participantNames.length > 0) {
        // Check if any participant name appears in the text
        for (const name of participantNames) {
          const nameLower = name.toLowerCase();
          const textLower = segment.text.toLowerCase();

          if (textLower.includes(nameLower)) {
            const speaker = speakers.find(s => s.name.toLowerCase() === nameLower);
            if (speaker) {
              bestMatch = {
                speakerId: speaker.id,
                confidence: 0.7, // Pattern-based match has lower confidence
                reason: 'pattern_match',
              };
              break;
            }
          }
        }
      }

      return {
        segmentId: segment.id,
        suggestedSpeakerId: bestMatch?.speakerId || null,
        confidence: bestMatch?.confidence || 0,
        reason: bestMatch?.reason || 'no_match',
      };
    },
    [speakers, meetingParticipantIds, confidenceThreshold, participantNames]
  );

  /**
   * Process the queue of pending segments
   */
  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift();
      if (!item) break;

      try {
        const result = await processSegmentInternal(item.segment);
        item.resolve(result);
        setProcessedCount(prev => prev + 1);
      } catch (error) {
        console.error('[LiveDiarization] Error processing segment:', error);
        item.resolve(null);
      }
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, [processSegmentInternal]);

  /**
   * Add a segment to the processing queue
   */
  const processSegment = useCallback(
    (segment: TranscriptSegment): Promise<DiarizationResult | null> => {
      if (!enabled) {
        return Promise.resolve(null);
      }

      // Skip if segment already has confirmed speaker
      if (segment.confirmed && segment.speakerId) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        queueRef.current.push({ segment, resolve });

        // Debounce queue processing
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          void processQueue();
        }, debounceMs);
      });
    },
    [enabled, debounceMs, processQueue]
  );

  /**
   * Process multiple segments at once (for batch operations)
   */
  const processSegments = useCallback(
    async (segments: TranscriptSegment[]): Promise<DiarizationResult[]> => {
      if (!enabled) {
        return [];
      }

      const results: DiarizationResult[] = [];

      for (const segment of segments) {
        if (!segment.confirmed || !segment.speakerId) {
          const result = await processSegmentInternal(segment);
          results.push(result);
        }
      }

      setProcessedCount(prev => prev + results.length);
      return results;
    },
    [enabled, processSegmentInternal]
  );

  /**
   * Clear the processing queue
   */
  const clearQueue = useCallback(() => {
    // Resolve all pending items with null
    for (const item of queueRef.current) {
      item.resolve(null);
    }
    queueRef.current = [];

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    clearQueue();
    setProcessedCount(0);
  }, [clearQueue]);

  return {
    // State
    isProcessing,
    processedCount,
    queueLength: queueRef.current.length,

    // Actions
    processSegment,
    processSegments,
    clearQueue,
    reset,
  };
}

export type UseLiveDiarizationReturn = ReturnType<typeof useLiveDiarization>;
