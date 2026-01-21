// Speaker Types for Aurora Meeting Assistant

// Predefined speaker colors for visual distinction
export const SPEAKER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Light Blue
] as const;

export interface SpeakerProfile {
  id: string;
  name: string;
  email?: string;
  color: string;
  // Stats
  meetingCount: number;
  totalSpeakingTime: number; // ms
  // Recognition hints (for future ML integration)
  voiceCharacteristics?: string; // user notes about voice
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt?: Date;
}

export interface SpeakerCreateInput {
  name: string;
  email?: string;
  color?: string;
  voiceCharacteristics?: string;
}

export interface SpeakerUpdateInput {
  name?: string;
  email?: string;
  color?: string;
  voiceCharacteristics?: string;
}

// Speaker segment in transcript (also defined in meeting.ts but more detailed here)
export interface SpeakerSegment {
  id: string;
  speakerId: string | null; // null = unassigned
  suggestedSpeakerId?: string; // AI suggestion
  confidence: number; // 0-1, how confident AI is about speaker
  confirmed: boolean; // user has confirmed/corrected
  text: string;
  startTime: number; // ms from meeting start
  endTime: number;
}

// AI detection result for speaker changes
export interface SpeakerChangeDetection {
  segmentIndex: number;
  previousSpeakerId: string | null;
  suggestedSpeakerId: string | null;
  confidence: number;
  reason?: string; // AI explanation
}

export interface DiarizationResult {
  segments: SpeakerSegment[];
  speakerChanges: SpeakerChangeDetection[];
  detectedSpeakerCount: number;
}

// Speaker filter/query types
export interface SpeakerFilters {
  searchQuery?: string;
  minMeetingCount?: number;
}

export interface SpeakerStats {
  totalSpeakers: number;
  activeSpeakers: number; // seen in last 30 days
  averageMeetingsPerSpeaker: number;
}

// Helper to get next available color
export function getNextSpeakerColor(existingColors: string[]): string {
  const usedColors = new Set(existingColors);
  for (const color of SPEAKER_COLORS) {
    if (!usedColors.has(color)) {
      return color;
    }
  }
  // All colors used, return a random one
  return SPEAKER_COLORS[Math.floor(Math.random() * SPEAKER_COLORS.length)];
}
