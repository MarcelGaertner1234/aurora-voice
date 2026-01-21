// Speaker Matcher - Match detected speakers to known profiles
// Uses fuzzy matching and learning from user corrections

import type { SpeakerProfile, SpeakerSegment } from '@/types/speaker';

// Match result with confidence
export interface SpeakerMatch {
  speakerId: string;
  speakerName: string;
  confidence: number;
  matchReason: 'exact_name' | 'fuzzy_name' | 'context' | 'user_assigned';
}

// Fuzzy string similarity (Levenshtein distance based)
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}

// Find best matching speaker for a detected name
export function findBestMatch(
  detectedName: string,
  speakers: SpeakerProfile[],
  minConfidence: number = 0.6
): SpeakerMatch | null {
  if (!detectedName || speakers.length === 0) {
    return null;
  }

  let bestMatch: SpeakerMatch | null = null;
  let bestScore = 0;

  for (const speaker of speakers) {
    // Check name similarity
    const nameSimilarity = stringSimilarity(detectedName, speaker.name);

    // Check email prefix if available
    let emailSimilarity = 0;
    if (speaker.email) {
      const emailPrefix = speaker.email.split('@')[0];
      emailSimilarity = stringSimilarity(detectedName, emailPrefix);
    }

    const score = Math.max(nameSimilarity, emailSimilarity);

    if (score > bestScore && score >= minConfidence) {
      bestScore = score;
      bestMatch = {
        speakerId: speaker.id,
        speakerName: speaker.name,
        confidence: score,
        matchReason: score === 1 ? 'exact_name' : 'fuzzy_name',
      };
    }
  }

  return bestMatch;
}

// Match speaker with participant prioritization
// Meeting participants get a confidence bonus when matching
export function matchSpeaker(
  detectedName: string,
  allSpeakers: SpeakerProfile[],
  meetingParticipantIds?: string[]
): SpeakerMatch | null {
  if (!detectedName) return null;

  // 1. First, search among meeting participants with confidence bonus (+20%)
  if (meetingParticipantIds && meetingParticipantIds.length > 0) {
    const participants = allSpeakers.filter(s =>
      meetingParticipantIds.includes(s.id)
    );

    if (participants.length > 0) {
      const match = findBestMatch(detectedName, participants, 0.5); // Lower threshold for participants
      if (match && match.confidence >= 0.5) {
        // Apply confidence bonus for meeting participants (capped at 1.0)
        return {
          ...match,
          confidence: Math.min(match.confidence + 0.2, 1.0),
          matchReason: match.matchReason,
        };
      }
    }
  }

  // 2. Then search all speakers without bonus
  return findBestMatch(detectedName, allSpeakers);
}

// Match multiple detected names to speakers
export function matchSpeakers(
  detectedNames: (string | null)[],
  speakers: SpeakerProfile[]
): Map<string, SpeakerMatch> {
  const matches = new Map<string, SpeakerMatch>();

  for (const name of detectedNames) {
    if (name && !matches.has(name)) {
      const match = findBestMatch(name, speakers);
      if (match) {
        matches.set(name, match);
      }
    }
  }

  return matches;
}

// Suggest speakers based on meeting context
export function suggestSpeakersForMeeting(
  speakers: SpeakerProfile[],
  participantIds: string[]
): SpeakerProfile[] {
  // First, return explicitly set participants
  const participants = speakers.filter((s) => participantIds.includes(s.id));

  // Then, sort remaining by meeting count (most frequent first)
  const others = speakers
    .filter((s) => !participantIds.includes(s.id))
    .sort((a, b) => b.meetingCount - a.meetingCount);

  return [...participants, ...others];
}

// Learn from user corrections
export interface CorrectionLearning {
  originalName: string;
  correctedSpeakerId: string;
  context?: string; // surrounding text
}

// Store corrections for future matching (in-memory for now)
const correctionHistory: CorrectionLearning[] = [];

export function recordCorrection(correction: CorrectionLearning): void {
  // Avoid duplicates
  const exists = correctionHistory.some(
    (c) =>
      c.originalName === correction.originalName &&
      c.correctedSpeakerId === correction.correctedSpeakerId
  );

  if (!exists) {
    correctionHistory.push(correction);
  }
}

export function findFromCorrections(
  name: string,
  speakers: SpeakerProfile[]
): SpeakerMatch | null {
  const correction = correctionHistory.find(
    (c) => stringSimilarity(c.originalName, name) > 0.8
  );

  if (correction) {
    const speaker = speakers.find((s) => s.id === correction.correctedSpeakerId);
    if (speaker) {
      return {
        speakerId: speaker.id,
        speakerName: speaker.name,
        confidence: 0.9, // High confidence from user correction
        matchReason: 'user_assigned',
      };
    }
  }

  return null;
}

// Enhanced matching that considers corrections
export function findBestMatchWithLearning(
  detectedName: string,
  speakers: SpeakerProfile[],
  minConfidence: number = 0.6
): SpeakerMatch | null {
  // First check corrections
  const correctionMatch = findFromCorrections(detectedName, speakers);
  if (correctionMatch) {
    return correctionMatch;
  }

  // Fall back to regular matching
  return findBestMatch(detectedName, speakers, minConfidence);
}

// Assign speaker colors for unknown speakers
let unknownSpeakerCounter = 0;
const unknownSpeakerColors = [
  '#9CA3AF', // gray
  '#6B7280', // darker gray
  '#4B5563', // even darker
];

export function getUnknownSpeakerLabel(): { label: string; color: string } {
  const index = unknownSpeakerCounter % unknownSpeakerColors.length;
  const label = `Sprecher ${unknownSpeakerCounter + 1}`;
  unknownSpeakerCounter++;
  return {
    label,
    color: unknownSpeakerColors[index],
  };
}

export function resetUnknownSpeakerCounter(): void {
  unknownSpeakerCounter = 0;
}

// Calculate speaking time per speaker from segments
export function calculateSpeakingTime(
  segments: SpeakerSegment[]
): Map<string, number> {
  const speakingTime = new Map<string, number>();

  for (const segment of segments) {
    if (segment.speakerId) {
      const duration = segment.endTime - segment.startTime;
      const current = speakingTime.get(segment.speakerId) || 0;
      speakingTime.set(segment.speakerId, current + duration);
    }
  }

  return speakingTime;
}

// Get speaker statistics from segments
export interface SegmentSpeakerStats {
  speakerId: string;
  segmentCount: number;
  totalDuration: number;
  percentage: number;
}

export function getSegmentSpeakerStats(
  segments: SpeakerSegment[]
): SegmentSpeakerStats[] {
  const stats = new Map<string, { count: number; duration: number }>();
  let totalDuration = 0;

  for (const segment of segments) {
    const speakerId = segment.speakerId || 'unknown';
    const duration = segment.endTime - segment.startTime;
    totalDuration += duration;

    const current = stats.get(speakerId) || { count: 0, duration: 0 };
    stats.set(speakerId, {
      count: current.count + 1,
      duration: current.duration + duration,
    });
  }

  return Array.from(stats.entries()).map(([speakerId, { count, duration }]) => ({
    speakerId,
    segmentCount: count,
    totalDuration: duration,
    percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0,
  }));
}
