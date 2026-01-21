// Meeting Types for Aurora Meeting Assistant

export type MeetingPhase = 'pre' | 'live' | 'post';
export type MeetingStatus = 'scheduled' | 'in-progress' | 'completed' | 'cancelled';

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  duration?: number; // in minutes
  completed: boolean;
  order: number;
}

export interface TranscriptSegment {
  id: string;
  speakerId: string | null;
  suggestedSpeakerId?: string; // AI suggestion
  confidence: number;
  confirmed: boolean; // User confirmed speaker
  text: string;
  startTime: number; // ms from meeting start
  endTime: number;
  keywords?: string[];
}

export interface Transcript {
  segments: TranscriptSegment[];
  fullText: string;
  duration: number; // total duration in ms
  language: string;
}

// Decision status type
export type DecisionStatus = 'decided' | 'pending';

export interface MeetingDecision {
  id: string;
  text: string;
  context?: string;
  timestamp: number;
  participants: string[]; // speaker IDs involved
  status?: DecisionStatus; // decided = already made, pending = needs to be made
  suggestedAction?: string; // recommended next steps (for pending decisions)
  assigneeId?: string; // responsible person ID
  assigneeName?: string; // responsible person name
}

// Question extraction type
export type QuestionExtractionType = 'explicit' | 'implicit';

export interface MeetingQuestion {
  id: string;
  text: string;
  askedBy?: string; // speaker ID
  answered: boolean;
  answer?: string;
  timestamp: number;
  type?: QuestionExtractionType; // explicit = directly asked, implicit = inferred from missing info
  context?: string; // why this question is important
  assigneeId?: string; // responsible person ID
  assigneeName?: string; // responsible person name
}

export interface MeetingSummary {
  overview: string;
  keyPoints: string[];
  decisions: MeetingDecision[];
  openQuestions: MeetingQuestion[];
  generatedAt: Date;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  phase: MeetingPhase;
  status: MeetingStatus;
  participantIds: string[];
  agenda: AgendaItem[];
  transcript?: Transcript;
  summary?: MeetingSummary;
  recordings?: MeetingRecording[];  // Audio recordings
  taskIds: string[];
  tags?: string[];
  projectPath?: string; // Path to project for code context
  // Timestamps
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingCreateInput {
  title: string;
  description?: string;
  participantIds?: string[];
  agenda?: Omit<AgendaItem, 'id' | 'completed'>[];
  scheduledAt?: Date;
  tags?: string[];
  projectPath?: string;
}

export interface MeetingUpdateInput {
  title?: string;
  description?: string;
  participantIds?: string[];
  agenda?: AgendaItem[];
  taskIds?: string[];
  tags?: string[];
  scheduledAt?: Date;
  projectPath?: string;
}

// Meeting filter/query types
export interface MeetingFilters {
  status?: MeetingStatus | MeetingStatus[];
  phase?: MeetingPhase | MeetingPhase[];
  participantIds?: string[];
  tags?: string[];
  fromDate?: Date;
  toDate?: Date;
  searchQuery?: string;
}

export interface MeetingStats {
  totalMeetings: number;
  totalDuration: number; // ms
  averageDuration: number; // ms
  tasksCreated: number;
  decisionsCount: number;
}

// Audio recording for meeting
export interface MeetingRecording {
  id: string;
  blob: Blob;              // Audio data
  mimeType: string;        // 'audio/webm', 'audio/ogg', etc.
  duration: number;        // Duration in ms
  createdAt: Date;
  transcriptSegmentIds: string[];  // Linked transcript segment IDs
  dataUrl?: string;        // Cached Data URL for WebKit-compatible playback
}
