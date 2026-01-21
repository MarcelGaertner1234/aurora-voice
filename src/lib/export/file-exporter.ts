// File Exporter for Aurora Meeting Assistant
// Generates readable markdown files for storage in project folders

import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Meeting, TranscriptSegment, MeetingDecision, MeetingQuestion } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';

// Format timestamp as MM:SS
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Format duration as human-readable
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${mins}min`;
  }
  return `${mins} Minuten`;
}

// Get speaker name by ID
function getSpeakerName(speakerId: string | null, speakers: SpeakerProfile[]): string {
  if (!speakerId) return 'Unbekannt';
  const speaker = speakers.find((s) => s.id === speakerId);
  return speaker?.name || `Sprecher ${speakerId.slice(0, 4)}`;
}

// Priority labels in German
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  urgent: 'Dringend',
};

/**
 * Generate transcript markdown file content
 * Creates a readable transcript with timestamps and speaker labels
 */
export function generateTranscriptMarkdown(
  meeting: Meeting,
  speakers: SpeakerProfile[] = []
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Transkript: ${meeting.title}`);
  lines.push('');

  // Metadata
  lines.push(`**Datum:** ${format(meeting.createdAt, 'dd. MMMM yyyy, HH:mm', { locale: de })}`);
  if (meeting.transcript?.duration) {
    lines.push(`**Dauer:** ${formatDuration(meeting.transcript.duration)}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Transcript segments
  if (meeting.transcript?.segments && meeting.transcript.segments.length > 0) {
    lines.push('## Segmente');
    lines.push('');

    let lastSpeakerId: string | null = null;

    for (const segment of meeting.transcript.segments) {
      const timestamp = formatTimestamp(segment.startTime);
      const speakerId = segment.speakerId || segment.suggestedSpeakerId || null;
      const speakerName = getSpeakerName(speakerId, speakers);

      // Add speaker header if speaker changed
      if (speakerId !== lastSpeakerId) {
        lines.push('');
        lines.push(`**[${timestamp}] ${speakerName}:**`);
        lastSpeakerId = speakerId;
      }

      lines.push(`${segment.text}`);
    }
  } else {
    lines.push('_Kein Transkript vorhanden._');
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`_Exportiert am ${format(new Date(), 'dd.MM.yyyy HH:mm')} mit Aurora Meeting Assistant_`);

  return lines.join('\n');
}

/**
 * Generate summary markdown file content
 * Creates a readable summary with overview, decisions, and questions
 */
export function generateSummaryMarkdown(meeting: Meeting): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Zusammenfassung: ${meeting.title}`);
  lines.push('');

  // Metadata
  lines.push(`**Datum:** ${format(meeting.createdAt, 'dd. MMMM yyyy, HH:mm', { locale: de })}`);
  if (meeting.transcript?.duration) {
    lines.push(`**Dauer:** ${formatDuration(meeting.transcript.duration)}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  if (!meeting.summary) {
    lines.push('_Keine Zusammenfassung vorhanden._');
    lines.push('');
    return lines.join('\n');
  }

  // Overview
  if (meeting.summary.overview) {
    lines.push('## Übersicht');
    lines.push('');
    lines.push(meeting.summary.overview);
    lines.push('');
  }

  // Key Points
  if (meeting.summary.keyPoints && meeting.summary.keyPoints.length > 0) {
    lines.push('## Wichtige Punkte');
    lines.push('');
    for (const point of meeting.summary.keyPoints) {
      lines.push(`- ${point}`);
    }
    lines.push('');
  }

  // Decisions
  if (meeting.summary.decisions && meeting.summary.decisions.length > 0) {
    lines.push('## Entscheidungen');
    lines.push('');

    const decided = meeting.summary.decisions.filter((d) => d.status !== 'pending');
    const pending = meeting.summary.decisions.filter((d) => d.status === 'pending');

    if (decided.length > 0) {
      for (const decision of decided) {
        lines.push(`- [x] ${decision.text}`);
        if (decision.context) {
          lines.push(`  - _${decision.context}_`);
        }
      }
    }

    if (pending.length > 0) {
      lines.push('');
      lines.push('### Ausstehende Entscheidungen');
      lines.push('');
      for (const decision of pending) {
        lines.push(`- [ ] ${decision.text}`);
        if (decision.suggestedAction) {
          lines.push(`  - Empfehlung: _${decision.suggestedAction}_`);
        }
      }
    }
    lines.push('');
  }

  // Open Questions
  if (meeting.summary.openQuestions && meeting.summary.openQuestions.length > 0) {
    lines.push('## Offene Fragen');
    lines.push('');

    const unanswered = meeting.summary.openQuestions.filter((q) => !q.answered);
    const answered = meeting.summary.openQuestions.filter((q) => q.answered);

    for (const question of unanswered) {
      lines.push(`- [ ] ${question.text}`);
      if (question.context) {
        lines.push(`  - _${question.context}_`);
      }
    }

    if (answered.length > 0) {
      lines.push('');
      lines.push('### Beantwortete Fragen');
      lines.push('');
      for (const question of answered) {
        lines.push(`- [x] ${question.text}`);
        if (question.answer) {
          lines.push(`  - **Antwort:** ${question.answer}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Generiert am ${format(meeting.summary.generatedAt, 'dd.MM.yyyy HH:mm')} mit Aurora Meeting Assistant_`);

  return lines.join('\n');
}

/**
 * Generate tasks markdown file content
 * Creates a readable task list grouped by status
 */
export function generateTasksMarkdown(
  tasks: Task[],
  meetingTitle: string
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Aufgaben: ${meetingTitle}`);
  lines.push('');
  lines.push(`_Aktualisiert am ${format(new Date(), 'dd.MM.yyyy HH:mm')}_`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (tasks.length === 0) {
    lines.push('_Keine Aufgaben vorhanden._');
    lines.push('');
    return lines.join('\n');
  }

  // Group tasks by status
  const pending = tasks.filter((t) => t.status === 'pending');
  const inProgress = tasks.filter((t) => t.status === 'in-progress');
  const completed = tasks.filter((t) => t.status === 'completed');
  const cancelled = tasks.filter((t) => t.status === 'cancelled');

  // In Progress
  if (inProgress.length > 0) {
    lines.push('## In Bearbeitung');
    lines.push('');
    for (const task of inProgress) {
      const assignee = task.assigneeName ? ` @${task.assigneeName}` : '';
      const priority = task.priority !== 'medium' ? ` - ${PRIORITY_LABELS[task.priority]}` : '';
      const due = task.dueDate ? ` (bis ${format(task.dueDate, 'dd.MM.yyyy')})` : '';
      lines.push(`- [ ] **${task.title}**${assignee}${priority}${due}`);
      if (task.description) {
        lines.push(`  - ${task.description}`);
      }
    }
    lines.push('');
  }

  // Pending (Open)
  if (pending.length > 0) {
    lines.push('## Offen');
    lines.push('');
    for (const task of pending) {
      const assignee = task.assigneeName ? ` @${task.assigneeName}` : '';
      const priority = task.priority !== 'medium' ? ` - ${PRIORITY_LABELS[task.priority]}` : '';
      const due = task.dueDate ? ` (bis ${format(task.dueDate, 'dd.MM.yyyy')})` : '';
      lines.push(`- [ ] **${task.title}**${assignee}${priority}${due}`);
      if (task.description) {
        lines.push(`  - ${task.description}`);
      }
    }
    lines.push('');
  }

  // Completed
  if (completed.length > 0) {
    lines.push('## Erledigt');
    lines.push('');
    for (const task of completed) {
      const assignee = task.assigneeName ? ` @${task.assigneeName}` : '';
      const completedDate = task.completedAt ? ` (${format(task.completedAt, 'dd.MM.yyyy')})` : '';
      lines.push(`- [x] ~~${task.title}~~${assignee}${completedDate}`);
    }
    lines.push('');
  }

  // Cancelled
  if (cancelled.length > 0) {
    lines.push('## Abgebrochen');
    lines.push('');
    for (const task of cancelled) {
      lines.push(`- ~~${task.title}~~`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Exportiert mit Aurora Meeting Assistant_`);

  return lines.join('\n');
}

/**
 * Export all meeting artifacts to markdown
 * Returns an object with all markdown content
 */
export interface MeetingExportResult {
  transcript: string;
  summary: string;
  tasks: string;
}

export function exportMeetingToFiles(
  meeting: Meeting,
  tasks: Task[] = [],
  speakers: SpeakerProfile[] = []
): MeetingExportResult {
  return {
    transcript: generateTranscriptMarkdown(meeting, speakers),
    summary: generateSummaryMarkdown(meeting),
    tasks: generateTasksMarkdown(tasks, meeting.title),
  };
}
