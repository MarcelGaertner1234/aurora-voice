// Diarization Engine - Main entry point for speaker diarization
// Combines AI detection with speaker matching

import { v4 as uuidv4 } from 'uuid';
import type { Settings } from '@/types';
import type {
  SpeakerProfile,
  SpeakerSegment,
  DiarizationResult,
  SpeakerChangeDetection,
} from '@/types/speaker';
import type { TranscriptSegment } from '@/types/meeting';
import {
  detectSpeakerChanges,
  splitTextByChanges,
  quickDetectSpeakerHints,
  estimateSpeakerCount,
} from './ai-detector';
import {
  findBestMatchWithLearning,
  matchSpeaker,
  matchSpeakers,
  recordCorrection,
  resetUnknownSpeakerCounter,
  getUnknownSpeakerLabel,
  calculateSpeakingTime,
  getSegmentSpeakerStats,
  type SpeakerMatch,
} from './speaker-matcher';

export {
  // Re-export from ai-detector
  detectSpeakerChanges,
  quickDetectSpeakerHints,
  estimateSpeakerCount,
  // Re-export from speaker-matcher
  findBestMatchWithLearning,
  matchSpeaker,
  matchSpeakers,
  recordCorrection,
  calculateSpeakingTime,
  getSegmentSpeakerStats,
};

// Main diarization function - process a transcript segment
export async function diarizeSegment(
  text: string,
  startTime: number,
  speakers: SpeakerProfile[],
  settings: Settings
): Promise<DiarizationResult> {
  // Reset unknown speaker counter for new diarization
  resetUnknownSpeakerCounter();

  // Detect speaker changes using AI
  const detectedChanges = await detectSpeakerChanges(text, settings);

  // Split text into segments
  const splitSegments = splitTextByChanges(text, detectedChanges);

  // Match detected names to known speakers
  const detectedNames = splitSegments
    .map((s) => s.speakerName)
    .filter((n): n is string => n !== null);
  const speakerMatches = matchSpeakers(detectedNames, speakers);

  // Build speaker segments
  const segments: SpeakerSegment[] = [];
  const speakerChanges: SpeakerChangeDetection[] = [];
  let currentTime = startTime;

  for (let i = 0; i < splitSegments.length; i++) {
    const split = splitSegments[i];
    const wordCount = split.text.split(/\s+/).length;
    const estimatedDuration = wordCount * 300; // ~300ms per word average

    // Find speaker match
    let speakerId: string | null = null;
    let suggestedSpeakerId: string | undefined;
    let confidence = split.confidence;

    if (split.speakerName) {
      const match = speakerMatches.get(split.speakerName);
      if (match) {
        suggestedSpeakerId = match.speakerId;
        confidence = match.confidence;
      }
    }

    // Create segment
    const segment: SpeakerSegment = {
      id: uuidv4(),
      speakerId,
      suggestedSpeakerId,
      confidence,
      confirmed: false,
      text: split.text,
      startTime: currentTime,
      endTime: currentTime + estimatedDuration,
    };
    segments.push(segment);

    // Record speaker change
    if (i > 0) {
      const prevSegment = segments[i - 1];
      speakerChanges.push({
        segmentIndex: i,
        previousSpeakerId: prevSegment.speakerId,
        suggestedSpeakerId: suggestedSpeakerId || null,
        confidence,
        reason: detectedChanges[i]?.reason,
      });
    }

    currentTime += estimatedDuration;
  }

  return {
    segments,
    speakerChanges,
    detectedSpeakerCount: estimateSpeakerCount(text),
  };
}

// Process multiple transcript segments
export async function diarizeTranscript(
  transcriptSegments: TranscriptSegment[],
  speakers: SpeakerProfile[],
  settings: Settings
): Promise<SpeakerSegment[]> {
  const allSegments: SpeakerSegment[] = [];
  resetUnknownSpeakerCounter();

  for (const segment of transcriptSegments) {
    // If segment already has confirmed speaker, keep it
    if (segment.confirmed && segment.speakerId) {
      allSegments.push({
        id: segment.id,
        speakerId: segment.speakerId,
        suggestedSpeakerId: segment.suggestedSpeakerId,
        confidence: segment.confidence,
        confirmed: true,
        text: segment.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
      });
      continue;
    }

    // Process unconfirmed segments
    const result = await diarizeSegment(
      segment.text,
      segment.startTime,
      speakers,
      settings
    );

    // If diarization produced multiple segments, add them all
    // Otherwise, update the original segment with suggestions
    if (result.segments.length > 1) {
      allSegments.push(...result.segments);
    } else if (result.segments.length === 1) {
      allSegments.push({
        ...result.segments[0],
        id: segment.id, // Keep original ID
      });
    }
  }

  return allSegments;
}

// Confirm a speaker assignment
export function confirmSpeakerAssignment(
  segment: SpeakerSegment,
  speakerId: string,
  speakerName?: string
): SpeakerSegment {
  // Record correction for learning if there was a suggestion
  if (segment.suggestedSpeakerId && segment.suggestedSpeakerId !== speakerId) {
    // This was a correction
    const detectedNames = quickDetectSpeakerHints(segment.text);
    for (const name of detectedNames) {
      recordCorrection({
        originalName: name,
        correctedSpeakerId: speakerId,
        context: segment.text.slice(0, 100),
      });
    }
  }

  return {
    ...segment,
    speakerId,
    suggestedSpeakerId: undefined,
    confirmed: true,
    confidence: 1.0,
  };
}

// Reject a speaker suggestion
export function rejectSpeakerSuggestion(segment: SpeakerSegment): SpeakerSegment {
  return {
    ...segment,
    suggestedSpeakerId: undefined,
    confirmed: false,
    confidence: 0.5,
  };
}

// Get speaker color for display
export function getSpeakerColor(
  speakerId: string | null,
  speakers: SpeakerProfile[]
): string {
  if (!speakerId) {
    return '#9CA3AF'; // Gray for unknown
  }

  const speaker = speakers.find((s) => s.id === speakerId);
  return speaker?.color || '#9CA3AF';
}

// Get speaker display name
export function getSpeakerDisplayName(
  speakerId: string | null,
  suggestedSpeakerId: string | undefined,
  speakers: SpeakerProfile[],
  showSuggestion: boolean = true
): { name: string; isSuggestion: boolean } {
  // Check confirmed speaker first
  if (speakerId) {
    const speaker = speakers.find((s) => s.id === speakerId);
    if (speaker) {
      return { name: speaker.name, isSuggestion: false };
    }
  }

  // Check suggestion
  if (showSuggestion && suggestedSpeakerId) {
    const suggested = speakers.find((s) => s.id === suggestedSpeakerId);
    if (suggested) {
      return { name: suggested.name, isSuggestion: true };
    }
  }

  // Unknown speaker
  const unknown = getUnknownSpeakerLabel();
  return { name: unknown.label, isSuggestion: false };
}

// Batch update speakers in segments
export function batchUpdateSpeakers(
  segments: SpeakerSegment[],
  updates: Map<string, string> // segmentId -> speakerId
): SpeakerSegment[] {
  return segments.map((segment) => {
    const newSpeakerId = updates.get(segment.id);
    if (newSpeakerId !== undefined) {
      return confirmSpeakerAssignment(segment, newSpeakerId);
    }
    return segment;
  });
}

// Auto-assign speakers based on patterns in the meeting
export function autoAssignSpeakers(
  segments: SpeakerSegment[],
  speakers: SpeakerProfile[]
): SpeakerSegment[] {
  // Find segments with confirmed speakers
  const confirmedPatterns = new Map<string, string>(); // pattern -> speakerId

  for (const segment of segments) {
    if (segment.confirmed && segment.speakerId) {
      // Extract patterns from confirmed segments
      const hints = quickDetectSpeakerHints(segment.text);
      for (const hint of hints) {
        confirmedPatterns.set(hint.toLowerCase(), segment.speakerId);
      }
    }
  }

  // Apply patterns to unconfirmed segments
  return segments.map((segment) => {
    if (segment.confirmed || segment.speakerId) {
      return segment;
    }

    // Check if any pattern matches
    const hints = quickDetectSpeakerHints(segment.text);
    for (const hint of hints) {
      const matchedSpeakerId = confirmedPatterns.get(hint.toLowerCase());
      if (matchedSpeakerId) {
        return {
          ...segment,
          suggestedSpeakerId: matchedSpeakerId,
          confidence: 0.7, // Pattern-based confidence
        };
      }
    }

    return segment;
  });
}
