// Meeting Store for Aurora Meeting Assistant

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/utils/logger';
import type {
  Meeting,
  MeetingPhase,
  MeetingStatus,
  MeetingCreateInput,
  MeetingUpdateInput,
  AgendaItem,
  Transcript,
  TranscriptSegment,
  MeetingSummary,
  MeetingFilters,
  MeetingRecording,
  MeetingDecision,
  MeetingQuestion,
} from '@/types/meeting';
import type { ProjectContext, ProjectAnalysis } from '@/types/project';
import {
  getAllMeetings,
  getMeetingById,
  saveMeeting,
  deleteMeeting as dbDeleteMeeting,
  getMeetingsByStatus,
  saveRecording as dbSaveRecording,
  getRecordingsByMeetingId,
  deleteRecordingsByMeetingId,
  deleteRecording as dbDeleteRecording,
} from '@/lib/db';
import {
  getStorageProvider,
  getProjectStorageProvider,
  exportMeetingToProject,
  exportRecordingToProject,
} from '@/lib/storage';
import { indexProject } from '@/lib/project/indexer';
import { analyzeProject, quickAnalyzeProject } from '@/lib/project/analyzer';
import {
  generateTranscriptMarkdown,
  generateSummaryMarkdown,
} from '@/lib/export/file-exporter';

// Helper to generate a hash for deduplication
function generateSegmentHash(segment: Omit<TranscriptSegment, 'id'>): string {
  return `${segment.text}-${segment.startTime}-${segment.endTime}`;
}

// Helper: Simple text similarity (Levenshtein-based)
function textSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  // Quick check for exact match
  if (aLower === bLower) return 1;

  // Quick check for contains
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.9;
  }

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      if (aLower[i - 1] === bLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  const maxLen = Math.max(aLower.length, bLower.length);
  if (maxLen === 0) return 1;
  return 1 - matrix[aLower.length][bLower.length] / maxLen;
}

// Helper: Merge decisions with deduplication
function mergeDecisions(existing: MeetingDecision[], newOnes: MeetingDecision[]): MeetingDecision[] {
  const result = [...existing];

  for (const newDecision of newOnes) {
    const isDuplicate = result.some(d =>
      textSimilarity(d.text, newDecision.text) > 0.8  // 80% similarity threshold
    );
    if (!isDuplicate) {
      result.push(newDecision);
    }
  }

  return result;
}

// Helper: Merge questions with deduplication
function mergeQuestions(existing: MeetingQuestion[], newOnes: MeetingQuestion[]): MeetingQuestion[] {
  const result = [...existing];

  for (const newQuestion of newOnes) {
    const isDuplicate = result.some(q =>
      textSimilarity(q.text, newQuestion.text) > 0.8  // 80% similarity threshold
    );
    if (!isDuplicate) {
      result.push(newQuestion);
    }
  }

  return result;
}

// Helper: Merge key points with deduplication
function mergeKeyPoints(existing: string[], newOnes: string[]): string[] {
  const result = [...existing];

  for (const newPoint of newOnes) {
    const isDuplicate = result.some(p =>
      textSimilarity(p, newPoint) > 0.8  // 80% similarity threshold
    );
    if (!isDuplicate) {
      result.push(newPoint);
    }
  }

  return result;
}

interface MeetingState {
  // Meetings list
  meetings: Meeting[];
  isLoading: boolean;
  error: string | null;

  // Current meeting (for live view)
  currentMeetingId: string | null;
  currentMeeting: Meeting | null;

  // Active room (sidebar selection)
  activeRoomId: string | null;

  // Sidebar state
  sidebarCollapsed: boolean;

  // Live recording state
  isRecording: boolean;
  recordingStartTime: number | null;
  liveTranscript: TranscriptSegment[];
  segmentHashes: Set<string>; // For deduplication

  // Actions - CRUD
  loadMeetings: () => Promise<void>;
  getMeeting: (id: string) => Promise<Meeting | undefined>;
  createMeeting: (input: MeetingCreateInput) => Promise<Meeting>;
  updateMeeting: (id: string, input: MeetingUpdateInput) => Promise<void>;
  deleteMeeting: (id: string) => Promise<void>;

  // Actions - Room/Sidebar
  setActiveRoom: (id: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  createRoomFromRecording: (options?: {
    title?: string;
    description?: string;
    participantIds?: string[];
    projectPath?: string;
  }) => Promise<Meeting>;

  // Actions - Meeting lifecycle
  setCurrentMeeting: (id: string | null) => Promise<void>;
  startMeeting: (id: string) => Promise<void>;
  endMeeting: (id: string) => Promise<void>;
  setMeetingPhase: (id: string, phase: MeetingPhase) => Promise<void>;

  // Actions - Transcript
  addTranscriptSegment: (segment: Omit<TranscriptSegment, 'id'>) => Promise<void>;
  updateTranscriptSegment: (id: string, updates: Partial<TranscriptSegment>) => void;
  saveTranscript: () => Promise<void>;
  clearLiveTranscript: () => void;

  // Actions - Agenda
  addAgendaItem: (meetingId: string, item: Omit<AgendaItem, 'id' | 'completed' | 'order'>) => Promise<void>;
  updateAgendaItem: (meetingId: string, itemId: string, updates: Partial<AgendaItem>) => Promise<void>;
  removeAgendaItem: (meetingId: string, itemId: string) => Promise<void>;
  toggleAgendaItemComplete: (meetingId: string, itemId: string) => Promise<void>;

  // Actions - Summary
  setSummary: (meetingId: string, summary: MeetingSummary) => Promise<void>;
  mergeSummary: (meetingId: string, newSummary: MeetingSummary) => Promise<void>;
  updateQuestionAnswer: (meetingId: string, questionId: string, answer: string) => Promise<void>;
  updateDecisionAssignee: (meetingId: string, decisionId: string, assigneeId?: string, assigneeName?: string) => Promise<void>;
  updateQuestionAssignee: (meetingId: string, questionId: string, assigneeId?: string, assigneeName?: string) => Promise<void>;

  // Actions - Audio Recordings
  addRecording: (meetingId: string, blob: Blob, mimeType: string, duration: number, transcriptSegmentIds?: string[]) => Promise<MeetingRecording>;
  loadRecordings: (meetingId: string) => Promise<MeetingRecording[]>;
  deleteRecording: (recordingId: string) => Promise<void>;

  // Actions - Recording
  setRecording: (isRecording: boolean) => void;
  setRecordingStartTime: (time: number | null) => void;

  // Actions - Export Path (project folder for export)
  setExportPath: (meetingId: string, projectPath: string) => Promise<void>;
  clearExportPath: (meetingId: string) => Promise<void>;
  exportMeetingNow: (meetingId: string) => Promise<void>;

  // Actions - Speaker Mapping
  applySpeakerMapping: (meetingId: string, mapping: Record<string, string>) => Promise<void>;

  // Actions - Error handling
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  // Initial state
  meetings: [],
  isLoading: false,
  error: null,
  currentMeetingId: null,
  currentMeeting: null,
  activeRoomId: null,
  sidebarCollapsed: false,
  isRecording: false,
  recordingStartTime: null,
  liveTranscript: [],
  segmentHashes: new Set<string>(),

  // Load all meetings from IndexedDB (single source of truth)
  loadMeetings: async () => {
    set({ isLoading: true, error: null });
    try {
      const meetings = await getAllMeetings();
      set({ meetings, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load meetings',
        isLoading: false,
      });
    }
  },

  // Get a single meeting from IndexedDB
  getMeeting: async (id: string) => {
    try {
      // FIRST: Check cached meetings array
      const { meetings } = get();
      const cachedMeeting = meetings.find(m => m.id === id);
      if (cachedMeeting) return cachedMeeting;

      // THEN: Load from IndexedDB
      const meeting = await getMeetingById(id);
      return meeting;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to get meeting' });
      return undefined;
    }
  },

  // Create a new meeting (always saves to IndexedDB)
  createMeeting: async (input: MeetingCreateInput) => {
    const now = new Date();
    const meeting: Meeting = {
      id: uuidv4(),
      title: input.title,
      description: input.description,
      phase: 'pre',
      status: 'scheduled',
      participantIds: input.participantIds || [],
      agenda: (input.agenda || []).map((item, index) => ({
        ...item,
        id: uuidv4(),
        completed: false,
        order: index,
      })),
      taskIds: [],
      tags: input.tags,
      projectPath: input.projectPath, // Export path (optional)
      scheduledAt: input.scheduledAt,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Always save to IndexedDB
      const provider = getStorageProvider();
      await provider.saveMeeting(meeting);

      // Best-effort export if project path is set
      if (input.projectPath) {
        exportMeetingToProject(meeting).catch((err) => logger.warn('Failed to export meeting to project:', err));
      }

      set((state) => ({
        meetings: [meeting, ...state.meetings],
      }));
      return meeting;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create meeting' });
      throw err;
    }
  },

  // Update a meeting (always saves to IndexedDB)
  updateMeeting: async (id: string, input: MeetingUpdateInput) => {
    const meeting = await get().getMeeting(id);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      ...input,
      updatedAt: new Date(),
    };

    try {
      // Always save to IndexedDB
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === id ? updated : m)),
        currentMeeting: state.currentMeetingId === id ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update meeting' });
      throw err;
    }
  },

  // Delete a meeting (always from IndexedDB)
  deleteMeeting: async (id: string) => {
    try {
      // Delete from IndexedDB (single source of truth)
      await dbDeleteMeeting(id);

      // Also delete recordings
      await deleteRecordingsByMeetingId(id);

      set((state) => ({
        meetings: state.meetings.filter((m) => m.id !== id),
        currentMeetingId: state.currentMeetingId === id ? null : state.currentMeetingId,
        currentMeeting: state.currentMeetingId === id ? null : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete meeting' });
      throw err;
    }
  },

  // Set current meeting for live view
  setCurrentMeeting: async (id: string | null) => {
    if (id === null) {
      set({ currentMeetingId: null, currentMeeting: null });
      return;
    }

    try {
      // Get meeting from cache or IndexedDB
      let meeting = await get().getMeeting(id);
      if (!meeting) {
        set({ currentMeetingId: id, currentMeeting: null });
        return;
      }

      // Clean up duplicate segments if they exist
      if (meeting?.transcript?.segments) {
        const seen = new Set<string>();
        const deduplicatedSegments = meeting.transcript.segments.filter(segment => {
          if (seen.has(segment.id)) {
            return false;
          }
          seen.add(segment.id);
          return true;
        });

        // If duplicates were found, update the meeting in storage
        if (deduplicatedSegments.length < meeting.transcript.segments.length) {
          const cleanedMeeting: Meeting = {
            ...meeting,
            transcript: {
              ...meeting.transcript,
              segments: deduplicatedSegments,
              fullText: deduplicatedSegments.map(s => s.text).join(' '),
            },
          };
          const provider = getStorageProvider();
          await provider.saveMeeting(cleanedMeeting);
          meeting = cleanedMeeting;
        }
      }

      // Update state
      set((state) => ({
        currentMeetingId: id,
        currentMeeting: meeting,
        meetings: state.meetings.some(m => m.id === id)
          ? state.meetings.map(m => m.id === id ? meeting! : m)
          : [...state.meetings, meeting!],
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load meeting' });
    }
  },

  // Start a meeting
  startMeeting: async (id: string) => {
    const meeting = await get().getMeeting(id);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      phase: 'live',
      status: 'in-progress',
      startedAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);
      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === id ? updated : m)),
        currentMeeting: state.currentMeetingId === id ? updated : state.currentMeeting,
        isRecording: true,
        recordingStartTime: Date.now(),
        liveTranscript: [],
        segmentHashes: new Set<string>(),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to start meeting' });
      throw err;
    }
  },

  // End a meeting
  endMeeting: async (id: string) => {
    const meeting = await get().getMeeting(id);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const { recordingStartTime } = get();

    // Segments are already saved to IndexedDB by addTranscriptSegment
    // We only need to update duration and meeting status
    const existingDuration = meeting.transcript?.duration || 0;
    const newDuration = recordingStartTime ? Date.now() - recordingStartTime : 0;

    // Update transcript duration if transcript exists (segments already in DB)
    const transcript: Transcript | undefined = meeting.transcript ? {
      ...meeting.transcript,
      duration: existingDuration + newDuration,
    } : undefined;

    const updated: Meeting = {
      ...meeting,
      phase: 'post',
      status: 'completed',
      endedAt: new Date(),
      transcript,
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      // Auto-export markdown files if meeting has a project path
      if (updated.projectPath) {
        try {
          const projectProvider = getProjectStorageProvider(updated.projectPath);
          const fs = projectProvider.getFileSystem();

          // Export transcript markdown
          if (updated.transcript?.segments && updated.transcript.segments.length > 0) {
            const transcriptMd = generateTranscriptMarkdown(updated, []);
            await fs.saveTranscriptMarkdown(updated, transcriptMd);
            logger.debug('Transcript markdown exported');
          }

          // Export summary markdown if available
          if (updated.summary) {
            const summaryMd = generateSummaryMarkdown(updated);
            await fs.saveSummaryMarkdown(updated, summaryMd);
            logger.debug('Summary markdown exported');
          }

          // Save meeting metadata JSON
          await fs.saveMeetingMetadata(updated);
          logger.debug('Meeting metadata exported');
        } catch (exportErr) {
          logger.error('Failed to export meeting files:', exportErr);
          // Don't fail the end meeting operation due to export failure
        }
      }

      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === id ? updated : m)),
        currentMeeting: state.currentMeetingId === id ? updated : state.currentMeeting,
        isRecording: false,
        recordingStartTime: null,
        segmentHashes: new Set<string>(), // Clear hashes for next session
        liveTranscript: [], // Clear live transcript for next session
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to end meeting' });
      throw err;
    }
  },

  // Set meeting phase
  setMeetingPhase: async (id: string, phase: MeetingPhase) => {
    const meeting = await get().getMeeting(id);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      phase,
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);
      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === id ? updated : m)),
        currentMeeting: state.currentMeetingId === id ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update meeting phase' });
      throw err;
    }
  },

  // Add transcript segment with deduplication and immediate persistence
  // Fix C3: DB check BEFORE state update to prevent inconsistencies
  // Fix C4: Surgical rollback to avoid overwriting concurrent state changes
  addTranscriptSegment: async (segment: Omit<TranscriptSegment, 'id'>) => {
    const { segmentHashes, currentMeetingId, recordingStartTime } = get();

    // Deduplication - check if segment already exists in local state
    const hash = generateSegmentHash(segment);
    if (segmentHashes.has(hash)) {
      return; // Skip duplicate
    }

    const newSegment: TranscriptSegment = {
      ...segment,
      id: uuidv4(),
    };

    // Fix C3: Check DB for duplicates BEFORE updating state
    if (currentMeetingId) {
      try {
        const meeting = await get().getMeeting(currentMeetingId);
        if (!meeting) {
          logger.warn('Meeting not found, skipping segment persistence');
          return;
        }

        // Note: Allow adding segments to completed meetings for follow-up recordings
        // The UI handles follow-up recordings on completed meetings

        // Append to existing segments if any, with deduplication by content hash
        const existingSegments = meeting.transcript?.segments || [];
        const existingHashes = new Set(
          existingSegments.map(s => `${s.text}-${s.startTime}-${s.endTime}`)
        );
        const newSegmentHash = `${newSegment.text}-${newSegment.startTime}-${newSegment.endTime}`;

        // Skip if same content already exists in DB
        if (existingHashes.has(newSegmentHash)) {
          return;
        }

        // Also deduplicate by ID (safety check)
        const existingIds = new Set(existingSegments.map(s => s.id));
        if (existingIds.has(newSegment.id)) {
          return;
        }

        // Now safe to update local state (after DB validation)
        set((state) => ({
          liveTranscript: [...state.liveTranscript, newSegment],
          segmentHashes: new Set([...state.segmentHashes, hash]),
        }));

        // Build updated meeting
        const allSegments = [...existingSegments, newSegment];
        const transcript: Transcript = {
          segments: allSegments,
          fullText: allSegments.map((s) => s.text).join(' '),
          duration: recordingStartTime ? Date.now() - recordingStartTime : 0,
          language: 'auto',
        };

        const updated: Meeting = {
          ...meeting,
          transcript,
          updatedAt: new Date(),
        };

        // Fix C4: Update state with surgical approach - only update specific meeting
        const meetingIdToUpdate = currentMeetingId;
        set((state) => ({
          meetings: state.meetings.map((m) => (m.id === meetingIdToUpdate ? updated : m)),
          currentMeeting: state.currentMeetingId === meetingIdToUpdate ? updated : state.currentMeeting,
        }));

        try {
          const provider = getStorageProvider();
          await provider.saveMeeting(updated);
        } catch (saveErr) {
          // Fix C4: Surgical rollback - only remove the segment we added, don't replace entire state
          set((state) => {
            const rolledBackSegments = state.liveTranscript.filter(s => s.id !== newSegment.id);
            const rolledBackHashes = new Set([...state.segmentHashes]);
            rolledBackHashes.delete(hash);

            // Rollback meeting state surgically
            const rolledBackMeetings = state.meetings.map((m) => {
              if (m.id === meetingIdToUpdate && m.transcript) {
                return {
                  ...m,
                  transcript: {
                    ...m.transcript,
                    segments: m.transcript.segments.filter(s => s.id !== newSegment.id),
                    fullText: m.transcript.segments.filter(s => s.id !== newSegment.id).map(s => s.text).join(' '),
                  },
                };
              }
              return m;
            });

            const rolledBackCurrent = state.currentMeeting?.id === meetingIdToUpdate && state.currentMeeting?.transcript
              ? {
                  ...state.currentMeeting,
                  transcript: {
                    ...state.currentMeeting.transcript,
                    segments: state.currentMeeting.transcript.segments.filter(s => s.id !== newSegment.id),
                    fullText: state.currentMeeting.transcript.segments.filter(s => s.id !== newSegment.id).map(s => s.text).join(' '),
                  },
                }
              : state.currentMeeting;

            return {
              liveTranscript: rolledBackSegments,
              segmentHashes: rolledBackHashes,
              meetings: rolledBackMeetings,
              currentMeeting: rolledBackCurrent,
            };
          });
          logger.error('Failed to save transcript segment, rolled back:', saveErr);
        }
      } catch (err) {
        logger.error('Failed to save transcript segment to storage:', err);
      }
    } else {
      // No meeting ID, just update local state (for preview/testing)
      set((state) => ({
        liveTranscript: [...state.liveTranscript, newSegment],
        segmentHashes: new Set([...state.segmentHashes, hash]),
      }));
    }
  },

  // Update transcript segment
  updateTranscriptSegment: (id: string, updates: Partial<TranscriptSegment>) => {
    set((state) => ({
      liveTranscript: state.liveTranscript.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }));
  },

  // Save transcript to current meeting
  saveTranscript: async () => {
    const { currentMeetingId, liveTranscript, recordingStartTime } = get();
    if (!currentMeetingId) return;

    const meeting = await get().getMeeting(currentMeetingId);
    if (!meeting) return;

    const transcript: Transcript = {
      segments: liveTranscript,
      fullText: liveTranscript.map((s) => s.text).join(' '),
      duration: recordingStartTime ? Date.now() - recordingStartTime : 0,
      language: 'auto',
    };

    const updated: Meeting = {
      ...meeting,
      transcript,
      updatedAt: new Date(),
    };

    const provider = getStorageProvider();
    await provider.saveMeeting(updated);
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === currentMeetingId ? updated : m)),
      currentMeeting: updated,
    }));
  },

  // Clear live transcript
  clearLiveTranscript: () => {
    set({ liveTranscript: [], segmentHashes: new Set<string>() });
  },

  // Add agenda item
  addAgendaItem: async (meetingId: string, item: Omit<AgendaItem, 'id' | 'completed' | 'order'>) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const newItem: AgendaItem = {
      ...item,
      id: uuidv4(),
      completed: false,
      order: meeting.agenda.length,
    };

    const updated: Meeting = {
      ...meeting,
      agenda: [...meeting.agenda, newItem],
      updatedAt: new Date(),
    };

    const provider = getStorageProvider();
    await provider.saveMeeting(updated);
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
      currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
    }));
  },

  // Update agenda item
  updateAgendaItem: async (meetingId: string, itemId: string, updates: Partial<AgendaItem>) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      agenda: meeting.agenda.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      ),
      updatedAt: new Date(),
    };

    const provider = getStorageProvider();
    await provider.saveMeeting(updated);
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
      currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
    }));
  },

  // Remove agenda item
  removeAgendaItem: async (meetingId: string, itemId: string) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      agenda: meeting.agenda.filter((item) => item.id !== itemId),
      updatedAt: new Date(),
    };

    const provider = getStorageProvider();
    await provider.saveMeeting(updated);
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
      currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
    }));
  },

  // Toggle agenda item complete
  toggleAgendaItemComplete: async (meetingId: string, itemId: string) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      agenda: meeting.agenda.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ),
      updatedAt: new Date(),
    };

    const provider = getStorageProvider();
    await provider.saveMeeting(updated);
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
      currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
    }));
  },

  // Set summary
  setSummary: async (meetingId: string, summary: MeetingSummary) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated: Meeting = {
      ...meeting,
      summary,
      updatedAt: new Date(),
    };

    const provider = getStorageProvider();
    await provider.saveMeeting(updated);

    // Auto-export summary markdown if meeting has a project path
    if (updated.projectPath) {
      try {
        const projectProvider = getProjectStorageProvider(updated.projectPath);
        const fs = projectProvider.getFileSystem();
        const summaryMd = generateSummaryMarkdown(updated);
        await fs.saveSummaryMarkdown(updated, summaryMd);
        logger.debug('Summary markdown updated');
      } catch (exportErr) {
        logger.error('Failed to export summary markdown:', exportErr);
      }
    }

    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
      currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
    }));
  },

  // Merge summary (accumulate decisions, questions, keyPoints from follow-up recordings)
  mergeSummary: async (meetingId: string, newSummary: MeetingSummary) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const existing = meeting.summary;

    // No existing summary → just set the new one
    if (!existing) {
      return get().setSummary(meetingId, newSummary);
    }

    // Merge decisions with deduplication
    const mergedDecisions = mergeDecisions(existing.decisions || [], newSummary.decisions || []);

    // Merge questions with deduplication
    const mergedQuestions = mergeQuestions(existing.openQuestions || [], newSummary.openQuestions || []);

    // Merge keyPoints with deduplication
    const mergedKeyPoints = mergeKeyPoints(existing.keyPoints || [], newSummary.keyPoints || []);

    // Extend overview chronologically
    const followUpDate = new Date().toLocaleDateString('de-DE');
    const mergedOverview = existing.overview + `\n\n---\n\n**Follow-up (${followUpDate}):**\n` + newSummary.overview;

    const merged: MeetingSummary = {
      overview: mergedOverview,
      keyPoints: mergedKeyPoints,
      decisions: mergedDecisions,
      openQuestions: mergedQuestions,
      generatedAt: new Date(),
    };

    return get().setSummary(meetingId, merged);
  },

  // Update answer for an open question
  updateQuestionAnswer: async (meetingId: string, questionId: string, answer: string) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting?.summary) {
      throw new Error('Meeting or summary not found');
    }

    const updatedQuestions = meeting.summary.openQuestions?.map(q =>
      q.id === questionId ? { ...q, answer, answered: answer.trim().length > 0 } : q
    ) || [];

    const updatedSummary: MeetingSummary = {
      ...meeting.summary,
      openQuestions: updatedQuestions,
    };

    const updated: Meeting = {
      ...meeting,
      summary: updatedSummary,
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      // Auto-export summary markdown if meeting has a project path
      if (updated.projectPath) {
        try {
          const projectProvider = getProjectStorageProvider(updated.projectPath);
          const fs = projectProvider.getFileSystem();
          const summaryMd = generateSummaryMarkdown(updated);
          await fs.saveSummaryMarkdown(updated, summaryMd);
        } catch (exportErr) {
          logger.error('Failed to export summary markdown:', exportErr);
        }
      }

      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
        currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update question answer' });
      throw err;
    }
  },

  // Update assignee for a decision
  updateDecisionAssignee: async (meetingId: string, decisionId: string, assigneeId?: string, assigneeName?: string) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting?.summary) {
      throw new Error('Meeting or summary not found');
    }

    const updatedDecisions = meeting.summary.decisions?.map(d =>
      d.id === decisionId ? { ...d, assigneeId, assigneeName } : d
    ) || [];

    const updatedSummary: MeetingSummary = {
      ...meeting.summary,
      decisions: updatedDecisions,
    };

    const updated: Meeting = {
      ...meeting,
      summary: updatedSummary,
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      // Auto-export summary markdown if meeting has a project path
      if (updated.projectPath) {
        try {
          const projectProvider = getProjectStorageProvider(updated.projectPath);
          const fs = projectProvider.getFileSystem();
          const summaryMd = generateSummaryMarkdown(updated);
          await fs.saveSummaryMarkdown(updated, summaryMd);
        } catch (exportErr) {
          logger.error('Failed to export summary markdown:', exportErr);
        }
      }

      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
        currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update decision assignee' });
      throw err;
    }
  },

  // Update assignee for a question
  updateQuestionAssignee: async (meetingId: string, questionId: string, assigneeId?: string, assigneeName?: string) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting?.summary) {
      throw new Error('Meeting or summary not found');
    }

    const updatedQuestions = meeting.summary.openQuestions?.map(q =>
      q.id === questionId ? { ...q, assigneeId, assigneeName } : q
    ) || [];

    const updatedSummary: MeetingSummary = {
      ...meeting.summary,
      openQuestions: updatedQuestions,
    };

    const updated: Meeting = {
      ...meeting,
      summary: updatedSummary,
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      // Auto-export summary markdown if meeting has a project path
      if (updated.projectPath) {
        try {
          const projectProvider = getProjectStorageProvider(updated.projectPath);
          const fs = projectProvider.getFileSystem();
          const summaryMd = generateSummaryMarkdown(updated);
          await fs.saveSummaryMarkdown(updated, summaryMd);
        } catch (exportErr) {
          logger.error('Failed to export summary markdown:', exportErr);
        }
      }

      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
        currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update question assignee' });
      throw err;
    }
  },

  // Add audio recording to meeting (stored in IndexedDB for all meeting types)
  addRecording: async (meetingId: string, blob: Blob, mimeType: string, duration: number, transcriptSegmentIds: string[] = []) => {
    logger.debug('addRecording called:', {
      meetingId,
      blobSize: blob.size,
      blobType: blob.type,
      mimeType,
      duration,
    });

    const meeting = await get().getMeeting(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const recording: MeetingRecording = {
      id: uuidv4(),
      blob,
      mimeType,
      duration,
      createdAt: new Date(),
      transcriptSegmentIds,
    };

    // Save recording to IndexedDB (blob storage)
    await dbSaveRecording(recording, meetingId);

    logger.debug('Recording saved successfully:', {
      recordingId: recording.id,
      meetingId,
    });

    // Also save recording file to project folder if meeting has a project path
    if (meeting.projectPath) {
      try {
        const projectProvider = getProjectStorageProvider(meeting.projectPath);
        const fs = projectProvider.getFileSystem();
        const filename = await fs.saveRecordingFile(meeting, recording.id, blob, mimeType);
        logger.debug('Recording file saved to project folder:', filename);
      } catch (fileErr) {
        logger.error('Failed to save recording file to project folder:', fileErr);
        // Don't fail the operation - IndexedDB save already succeeded
      }
    }

    return recording;
  },

  // Load recordings for a meeting from IndexedDB
  loadRecordings: async (meetingId: string) => {
    const recordings = await getRecordingsByMeetingId(meetingId);
    logger.debug('loadRecordings result:', {
      meetingId,
      count: recordings.length,
      recordings: recordings.map(r => ({
        id: r.id,
        blobSize: r.blob?.size,
        blobType: r.blob?.type,
      })),
    });
    return recordings;
  },

  // Delete a single recording
  deleteRecording: async (recordingId: string) => {
    logger.debug('Deleting recording:', recordingId);
    await dbDeleteRecording(recordingId);
  },

  // Recording state
  setRecording: (isRecording: boolean) => set({ isRecording }),
  setRecordingStartTime: (time: number | null) => set({ recordingStartTime: time }),

  // Room/Sidebar state
  setActiveRoom: (id: string | null) => set({ activeRoomId: id }),
  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),

  // Create a new room from recording (auto-create when recording starts)
  createRoomFromRecording: async (options?: {
    title?: string;
    description?: string;
    participantIds?: string[];
    projectPath?: string;
  }) => {
    const now = new Date();
    const defaultTitle = `Meeting vom ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    const meeting: Meeting = {
      id: uuidv4(),
      title: options?.title || defaultTitle,
      description: options?.description,
      phase: 'live',
      status: 'in-progress',
      participantIds: options?.participantIds || [],
      agenda: [],
      taskIds: [],
      tags: [],
      projectPath: options?.projectPath,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Save to IndexedDB (export to project folder happens on endMeeting)
      const provider = getStorageProvider();
      await provider.saveMeeting(meeting);
      set((state) => ({
        meetings: [meeting, ...state.meetings],
        currentMeetingId: meeting.id,
        currentMeeting: meeting,
        activeRoomId: meeting.id,
        isRecording: true,
        recordingStartTime: Date.now(),
        liveTranscript: [],
        segmentHashes: new Set<string>(),
      }));
      return meeting;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create meeting room' });
      throw err;
    }
  },

  // Set export path for a meeting (project folder where exports go)
  setExportPath: async (meetingId: string, projectPath: string) => {
    try {
      const meeting = await get().getMeeting(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Update meeting with project path in IndexedDB
      const updated: Meeting = {
        ...meeting,
        projectPath,
        updatedAt: new Date(),
      };

      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      // Update state
      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
        currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
      }));

      // Best-effort export to project folder
      exportMeetingToProject(updated).catch((err) => logger.warn('Failed to export meeting to project:', err));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to set export path' });
      throw err;
    }
  },

  // Clear export path from a meeting
  clearExportPath: async (meetingId: string) => {
    try {
      const meeting = await get().getMeeting(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Remove project path from meeting
      const updated: Meeting = {
        ...meeting,
        projectPath: undefined,
        updatedAt: new Date(),
      };

      // Save to IndexedDB
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);

      // Update state
      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
        currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to clear export path' });
      throw err;
    }
  },

  // Export meeting now to configured project folder
  exportMeetingNow: async (meetingId: string) => {
    try {
      const meeting = await get().getMeeting(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      if (!meeting.projectPath) {
        throw new Error('No export path configured for this meeting');
      }

      // Export all meeting data to project folder
      const recordings = await getRecordingsByMeetingId(meetingId);
      await exportMeetingToProject(meeting);

      // Also export recordings
      for (const recording of recordings) {
        try {
          await exportRecordingToProject(meeting, recording);
        } catch (err) {
          logger.warn('Failed to export recording:', err);
        }
      }

      logger.info(`Meeting ${meetingId} exported to ${meeting.projectPath}`);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to export meeting' });
      throw err;
    }
  },

  // Apply speaker mapping to transcript segments
  applySpeakerMapping: async (meetingId: string, mapping: Record<string, string>) => {
    const meeting = await get().getMeeting(meetingId);
    if (!meeting?.transcript) return;

    const updatedSegments = meeting.transcript.segments.map(segment => {
      // Check both speakerId and suggestedSpeakerId for mapping
      const mappedId = mapping[segment.speakerId || ''] || mapping[segment.suggestedSpeakerId || ''];
      if (mappedId) {
        return {
          ...segment,
          speakerId: mappedId,
          confirmed: true,
        };
      }
      return segment;
    });

    const updatedTranscript = {
      ...meeting.transcript,
      segments: updatedSegments,
    };

    const updated: Meeting = {
      ...meeting,
      transcript: updatedTranscript,
      updatedAt: new Date(),
    };

    try {
      const provider = getStorageProvider();
      await provider.saveMeeting(updated);
      set((state) => ({
        meetings: state.meetings.map((m) => (m.id === meetingId ? updated : m)),
        currentMeeting: state.currentMeetingId === meetingId ? updated : state.currentMeeting,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to apply speaker mapping' });
      throw err;
    }
  },

  // Error handling
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}));
