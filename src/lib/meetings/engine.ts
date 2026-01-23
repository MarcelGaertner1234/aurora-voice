// Meeting Engine - Session Management for Aurora Meeting Assistant

import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type {
  Meeting,
  MeetingCreateInput,
  TranscriptSegment,
  MeetingSummary,
  MeetingDecision,
  MeetingQuestion,
} from '@/types/meeting';
import type { Settings, ProjectContext } from '@/types';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useTaskStore } from '@/lib/store/task-store';
import { extractTasksFromTranscript } from '@/lib/tasks/extractor';
import { useProjectStore } from '@/lib/store/project-store';

// Meeting session state
interface MeetingSession {
  meetingId: string;
  startTime: number;
  isActive: boolean;
  isPaused: boolean;
  pauseStartTime?: number;
  totalPausedTime: number;
}

let currentSession: MeetingSession | null = null;

// Get current session
export function getCurrentSession(): MeetingSession | null {
  return currentSession;
}

// Get elapsed time (excluding pauses)
export function getElapsedTime(): number {
  if (!currentSession) return 0;

  const now = Date.now();
  let elapsed = now - currentSession.startTime - currentSession.totalPausedTime;

  if (currentSession.isPaused && currentSession.pauseStartTime) {
    elapsed -= now - currentSession.pauseStartTime;
  }

  return Math.max(0, elapsed);
}

// Format elapsed time as HH:MM:SS
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Normalize timestamp values (old data in seconds -> milliseconds)
export function normalizeTimestamp(ms: number): number {
  // If value is less than 10000, assume it's in seconds and convert to milliseconds
  return ms < 10000 ? ms * 1000 : ms;
}

// Format absolute timestamp from meeting start + segment offset
// Supports both absolute Unix timestamps (> 1 trillion ms) and relative offsets
export function formatAbsoluteTimestamp(meetingStart: Date, timestampMs: number): string {
  // If timestampMs > 1 trillion, it's an absolute Unix timestamp (after year 2001)
  // Otherwise, it's a relative offset (for backwards compatibility with old data)
  const isAbsolute = timestampMs > 1_000_000_000_000;

  if (isAbsolute) {
    return format(new Date(timestampMs), 'dd.MM.yyyy, HH:mm:ss', { locale: de });
  }

  // Fallback for old relative offset data
  const normalizedOffset = normalizeTimestamp(timestampMs);
  const absoluteTime = new Date(meetingStart.getTime() + normalizedOffset);
  return format(absoluteTime, 'dd.MM.yyyy, HH:mm:ss', { locale: de });
}

// Create a new meeting and start session
export async function createAndStartMeeting(
  input: Partial<MeetingCreateInput>
): Promise<Meeting> {
  const store = useMeetingStore.getState();

  // Generate default title if not provided
  const title = input.title || `Meeting ${format(new Date(), 'dd.MM.yyyy HH:mm')}`;

  const meeting = await store.createMeeting({
    title,
    description: input.description,
    participantIds: input.participantIds || [],
    agenda: input.agenda,
    tags: input.tags,
  });

  return meeting;
}

// Start a meeting session
export async function startMeetingSession(meetingId: string): Promise<void> {
  const store = useMeetingStore.getState();

  // End any existing session
  if (currentSession?.isActive) {
    await endMeetingSession();
  }

  // Start the meeting
  await store.startMeeting(meetingId);

  // Create new session
  currentSession = {
    meetingId,
    startTime: Date.now(),
    isActive: true,
    isPaused: false,
    totalPausedTime: 0,
  };
}

// Pause meeting session
export function pauseMeetingSession(): void {
  if (!currentSession || !currentSession.isActive || currentSession.isPaused) return;

  currentSession.isPaused = true;
  currentSession.pauseStartTime = Date.now();
}

// Resume meeting session
export function resumeMeetingSession(): void {
  if (!currentSession || !currentSession.isPaused || !currentSession.pauseStartTime) return;

  currentSession.totalPausedTime += Date.now() - currentSession.pauseStartTime;
  currentSession.isPaused = false;
  currentSession.pauseStartTime = undefined;
}

// End meeting session
export async function endMeetingSession(): Promise<void> {
  if (!currentSession) return;

  const store = useMeetingStore.getState();

  // End the meeting
  await store.endMeeting(currentSession.meetingId);

  // Clear session
  currentSession = null;
}

// Add transcript segment during live meeting
export function addLiveTranscriptSegment(
  text: string,
  speakerId: string | null = null
): void {
  if (!currentSession?.isActive) return;

  const store = useMeetingStore.getState();
  const elapsed = getElapsedTime();

  store.addTranscriptSegment({
    speakerId,
    confidence: speakerId ? 0.8 : 0.5, // Lower confidence if no speaker assigned
    confirmed: false,
    text,
    startTime: elapsed,
    endTime: elapsed + (text.length * 50), // Rough estimate based on text length
  });
}

// Generate meeting summary using AI
export async function generateMeetingSummary(
  meetingId: string,
  settings: Settings
): Promise<MeetingSummary> {
  const store = useMeetingStore.getState();
  const meeting = await store.getMeeting(meetingId);

  if (!meeting) {
    throw new Error('Meeting not found');
  }

  if (!meeting.transcript) {
    throw new Error('No transcript available');
  }

  const transcriptText = meeting.transcript.fullText;

  // Import dynamically to avoid circular dependencies
  const { enrichTranscript } = await import('@/lib/ai/enrich');

  // Generate summary using the meeting mode
  const summaryText = await enrichTranscript({
    transcript: transcriptText,
    mode: 'meeting',
    settings,
  });

  // Parse the summary (basic parsing - could be enhanced with structured output)
  const summary = parseMeetingSummary(summaryText, meeting.id);

  // Save to meeting
  await store.setSummary(meetingId, summary);

  return summary;
}

// Parse AI-generated summary into structured format
function parseMeetingSummary(text: string, meetingId: string): MeetingSummary {
  const lines = text.split('\n');
  let currentSection = '';

  const summary: MeetingSummary = {
    overview: '',
    keyPoints: [],
    decisions: [],
    openQuestions: [],
    actionItems: [],
    generatedAt: new Date(),
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detect section headers
    if (trimmedLine.startsWith('## Zusammenfassung') || trimmedLine.toLowerCase().includes('summary')) {
      currentSection = 'overview';
      continue;
    }
    if (trimmedLine.startsWith('## Wichtige Punkte') || trimmedLine.toLowerCase().includes('key points')) {
      currentSection = 'keyPoints';
      continue;
    }
    if (trimmedLine.startsWith('## Entscheidungen') || trimmedLine.toLowerCase().includes('decisions')) {
      currentSection = 'decisions';
      continue;
    }
    if (trimmedLine.startsWith('## Offene Fragen') || trimmedLine.toLowerCase().includes('open questions')) {
      currentSection = 'openQuestions';
      continue;
    }
    if (trimmedLine.startsWith('## Action Items') || trimmedLine.toLowerCase().includes('action items') ||
        trimmedLine.startsWith('## Aufgaben') || trimmedLine.startsWith('## Nächste Schritte') ||
        trimmedLine.toLowerCase().includes('next steps')) {
      currentSection = 'actionItems';
      continue;
    }

    // Parse content based on current section
    if (!trimmedLine || trimmedLine.startsWith('##')) continue;

    const bulletContent = trimmedLine.replace(/^[-*•]\s*/, '').replace(/^\[[ x]\]\s*/, '');

    switch (currentSection) {
      case 'overview':
        if (summary.overview) {
          summary.overview += ' ' + bulletContent;
        } else {
          summary.overview = bulletContent;
        }
        break;

      case 'keyPoints':
        if (bulletContent) {
          summary.keyPoints.push(bulletContent);
        }
        break;

      case 'decisions':
        if (bulletContent) {
          summary.decisions.push({
            id: uuidv4(),
            text: bulletContent,
            timestamp: Date.now(),
            participants: [],
          });
        }
        break;

      case 'openQuestions':
        if (bulletContent) {
          summary.openQuestions.push({
            id: uuidv4(),
            text: bulletContent,
            answered: false,
            timestamp: Date.now(),
          });
        }
        break;

      case 'actionItems':
        if (bulletContent) {
          // Parse: "Task text (Verantwortlich: Name)" or "Task text (@Name)"
          const assigneeMatch = bulletContent.match(
            /(.+?)(?:\s*\((?:Verantwortlich|Assignee|Zuständig):\s*(.+?)\)|\s*\(@(.+?)\))?\s*$/i
          );
          const text = assigneeMatch ? assigneeMatch[1].trim() : bulletContent;
          const assignee = assigneeMatch ? (assigneeMatch[2] || assigneeMatch[3])?.trim() : undefined;

          if (text.length >= 3) {
            summary.actionItems!.push({
              id: uuidv4(),
              text,
              assigneeName: assignee,
              timestamp: Date.now(),
            });
          }
        }
        break;
    }
  }

  return summary;
}

// Extract and create tasks from meeting transcript
export async function extractAndCreateTasks(
  meetingId: string,
  settings: Settings,
  projectContext?: ProjectContext | null
): Promise<void> {
  const meetingStore = useMeetingStore.getState();
  const taskStore = useTaskStore.getState();

  const meeting = await meetingStore.getMeeting(meetingId);

  if (!meeting || !meeting.transcript) {
    throw new Error('Meeting or transcript not found');
  }

  // Get project context from meeting if not provided
  let context = projectContext;
  if (!context && meeting.projectPath) {
    const projectStore = useProjectStore.getState();
    context = projectStore.getCachedProject(meeting.projectPath);
  }

  // Extract tasks using AI with project context
  const { tasks: extractedTasks } = await extractTasksFromTranscript(
    meeting.transcript.fullText,
    settings,
    context
  );

  // Combine with action items from summary (if available)
  const allTasksToCreate: Array<{
    title: string;
    assigneeName?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    sourceText?: string;
  }> = [];

  // Add AI-extracted tasks from transcript
  const seenTitles = new Set<string>();
  for (const task of extractedTasks) {
    const prefix = task.title.toLowerCase().slice(0, 25);
    if (!seenTitles.has(prefix)) {
      seenTitles.add(prefix);
      allTasksToCreate.push({
        title: task.title,
        assigneeName: task.assigneeName,
        priority: task.priority,
        sourceText: task.sourceText,
      });
    }
  }

  // Add action items from summary (avoid duplicates)
  if (meeting.summary?.actionItems && meeting.summary.actionItems.length > 0) {
    for (const actionItem of meeting.summary.actionItems) {
      const prefix = actionItem.text.toLowerCase().slice(0, 25);
      if (!seenTitles.has(prefix)) {
        seenTitles.add(prefix);
        allTasksToCreate.push({
          title: actionItem.text,
          assigneeName: actionItem.assigneeName,
          priority: 'medium', // Default priority for action items
          sourceText: actionItem.text,
        });
      }
    }
  }

  // Create tasks in store
  const createdTasks = await taskStore.createTasks(
    allTasksToCreate.map((task) => ({
      meetingId,
      title: task.title,
      assigneeName: task.assigneeName,
      priority: task.priority,
      sourceText: task.sourceText,
    }))
  );

  // Update meeting with task IDs
  await meetingStore.updateMeeting(meetingId, {
    ...meeting,
    taskIds: [...meeting.taskIds, ...createdTasks.map((t) => t.id)],
  });
}

// Quick meeting: Create, start, record, end, summarize
export async function quickMeeting(settings: Settings): Promise<{
  meeting: Meeting;
  startSession: () => Promise<void>;
  endAndProcess: () => Promise<void>;
}> {
  const meeting = await createAndStartMeeting({});

  return {
    meeting,
    startSession: async () => {
      await startMeetingSession(meeting.id);
    },
    endAndProcess: async () => {
      await endMeetingSession();
      await generateMeetingSummary(meeting.id, settings);
      await extractAndCreateTasks(meeting.id, settings);
    },
  };
}

// Export current meeting to markdown
export function exportMeetingToMarkdown(meeting: Meeting): string {
  let md = `# ${meeting.title}\n\n`;

  md += `**Date:** ${format(meeting.createdAt, 'dd.MM.yyyy HH:mm')}\n`;
  md += `**Status:** ${meeting.status}\n`;

  if (meeting.startedAt && meeting.endedAt) {
    const durationMs = meeting.endedAt.getTime() - meeting.startedAt.getTime();
    md += `**Duration:** ${formatElapsedTime(durationMs)}\n`;
  }

  md += '\n---\n\n';

  // Agenda
  if (meeting.agenda.length > 0) {
    md += '## Agenda\n\n';
    for (const item of meeting.agenda) {
      const checkbox = item.completed ? '[x]' : '[ ]';
      md += `- ${checkbox} ${item.title}\n`;
    }
    md += '\n';
  }

  // Summary
  if (meeting.summary) {
    if (meeting.summary.overview) {
      md += '## Summary\n\n';
      md += `${meeting.summary.overview}\n\n`;
    }

    if (meeting.summary.keyPoints.length > 0) {
      md += '## Key Points\n\n';
      for (const point of meeting.summary.keyPoints) {
        md += `- ${point}\n`;
      }
      md += '\n';
    }

    if (meeting.summary.decisions.length > 0) {
      md += '## Decisions\n\n';
      for (const decision of meeting.summary.decisions) {
        md += `- ${decision.text}\n`;
      }
      md += '\n';
    }

    if (meeting.summary.openQuestions.length > 0) {
      md += '## Open Questions\n\n';
      for (const question of meeting.summary.openQuestions) {
        const status = question.answered ? '(answered)' : '(open)';
        md += `- ${question.text} ${status}\n`;
      }
      md += '\n';
    }
  }

  // Transcript
  if (meeting.transcript) {
    md += '## Transcript\n\n';
    md += meeting.transcript.fullText + '\n';
  }

  return md;
}
