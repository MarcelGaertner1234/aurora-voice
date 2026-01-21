// Enhanced Markdown Export for Aurora Meeting Assistant

import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Meeting, TranscriptSegment } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';

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

// Format timestamp as MM:SS
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Export options
export interface MarkdownExportOptions {
  includeMetadata?: boolean;
  includeAgenda?: boolean;
  includeSummary?: boolean;
  includeDecisions?: boolean;
  includeTasks?: boolean;
  includeQuestions?: boolean;
  includeTranscript?: boolean;
  includeTimestamps?: boolean;
  includeSpeakers?: boolean;
  language?: 'de' | 'en';
}

const DEFAULT_OPTIONS: MarkdownExportOptions = {
  includeMetadata: true,
  includeAgenda: true,
  includeSummary: true,
  includeDecisions: true,
  includeTasks: true,
  includeQuestions: true,
  includeTranscript: true,
  includeTimestamps: true,
  includeSpeakers: true,
  language: 'de',
};

// Labels for different languages
const LABELS = {
  de: {
    metadata: 'Meeting-Details',
    date: 'Datum',
    duration: 'Dauer',
    participants: 'Teilnehmer',
    status: 'Status',
    agenda: 'Agenda',
    summary: 'Zusammenfassung',
    keyPoints: 'Wichtige Punkte',
    decisions: 'Entscheidungen',
    tasks: 'Aufgaben',
    openQuestions: 'Offene Fragen',
    transcript: 'Transkript',
    assignee: 'Verantwortlich',
    dueDate: 'Fällig',
    priority: 'Priorität',
    generatedWith: 'Erstellt mit Aurora Meeting Assistant',
  },
  en: {
    metadata: 'Meeting Details',
    date: 'Date',
    duration: 'Duration',
    participants: 'Participants',
    status: 'Status',
    agenda: 'Agenda',
    summary: 'Summary',
    keyPoints: 'Key Points',
    decisions: 'Decisions',
    tasks: 'Action Items',
    openQuestions: 'Open Questions',
    transcript: 'Transcript',
    assignee: 'Assignee',
    dueDate: 'Due',
    priority: 'Priority',
    generatedWith: 'Generated with Aurora Meeting Assistant',
  },
};

// Main export function
export function exportMeetingToMarkdown(
  meeting: Meeting,
  tasks: Task[] = [],
  speakers: SpeakerProfile[] = [],
  options: MarkdownExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const l = LABELS[opts.language || 'de'];
  const lines: string[] = [];

  // Title
  lines.push(`# ${meeting.title}`);
  lines.push('');

  // Metadata
  if (opts.includeMetadata) {
    lines.push(`## ${l.metadata}`);
    lines.push('');
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **${l.date}** | ${format(meeting.createdAt, 'dd. MMMM yyyy, HH:mm', { locale: de })} |`);

    if (meeting.transcript) {
      lines.push(`| **${l.duration}** | ${formatDuration(meeting.transcript.duration)} |`);
    }

    if (meeting.participantIds.length > 0) {
      const participantNames = speakers
        .filter((s) => meeting.participantIds.includes(s.id))
        .map((s) => s.name)
        .join(', ');
      if (participantNames) {
        lines.push(`| **${l.participants}** | ${participantNames} |`);
      }
    }

    lines.push(`| **${l.status}** | ${meeting.status} |`);
    lines.push('');
  }

  // Agenda
  if (opts.includeAgenda && meeting.agenda.length > 0) {
    lines.push(`## ${l.agenda}`);
    lines.push('');
    for (const item of meeting.agenda) {
      const checkbox = item.completed ? '[x]' : '[ ]';
      const duration = item.duration ? ` _(${item.duration} min)_` : '';
      lines.push(`- ${checkbox} ${item.title}${duration}`);
      if (item.description) {
        lines.push(`  - ${item.description}`);
      }
    }
    lines.push('');
  }

  // Summary
  if (opts.includeSummary && meeting.summary) {
    lines.push(`## ${l.summary}`);
    lines.push('');

    if (meeting.summary.overview) {
      lines.push(meeting.summary.overview);
      lines.push('');
    }

    if (meeting.summary.keyPoints.length > 0) {
      lines.push(`### ${l.keyPoints}`);
      lines.push('');
      for (const point of meeting.summary.keyPoints) {
        lines.push(`- ${point}`);
      }
      lines.push('');
    }
  }

  // Decisions
  if (opts.includeDecisions && meeting.summary?.decisions.length) {
    lines.push(`## ${l.decisions}`);
    lines.push('');
    for (const decision of meeting.summary.decisions) {
      lines.push(`- **${decision.text}**`);
      if (decision.context) {
        lines.push(`  - _${decision.context}_`);
      }
      if (decision.participants.length > 0) {
        lines.push(`  - Beteiligte: ${decision.participants.join(', ')}`);
      }
    }
    lines.push('');
  }

  // Tasks
  if (opts.includeTasks && tasks.length > 0) {
    lines.push(`## ${l.tasks}`);
    lines.push('');

    // Group by status
    const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress');
    const completed = tasks.filter((t) => t.status === 'completed');

    if (pending.length > 0) {
      for (const task of pending) {
        const checkbox = task.status === 'completed' ? '[x]' : '[ ]';
        const assignee = task.assigneeName ? ` @${task.assigneeName}` : '';
        const due = task.dueDate
          ? ` _(${l.dueDate}: ${format(task.dueDate, 'dd.MM.yyyy')})_`
          : '';
        const priority = task.priority !== 'medium' ? ` [${task.priority}]` : '';
        lines.push(`- ${checkbox} ${task.title}${assignee}${due}${priority}`);
      }
    }

    if (completed.length > 0) {
      lines.push('');
      lines.push('**Erledigt:**');
      for (const task of completed) {
        lines.push(`- [x] ~~${task.title}~~`);
      }
    }
    lines.push('');
  }

  // Open Questions
  if (opts.includeQuestions && meeting.summary?.openQuestions.length) {
    lines.push(`## ${l.openQuestions}`);
    lines.push('');
    for (const question of meeting.summary.openQuestions) {
      const status = question.answered ? '(beantwortet)' : '(offen)';
      const askedBy = question.askedBy ? ` - _${question.askedBy}_` : '';
      lines.push(`- ${question.text} ${status}${askedBy}`);
      if (question.answer) {
        lines.push(`  - **Antwort:** ${question.answer}`);
      }
    }
    lines.push('');
  }

  // Transcript
  if (opts.includeTranscript && meeting.transcript) {
    lines.push(`## ${l.transcript}`);
    lines.push('');

    for (const segment of meeting.transcript.segments) {
      const timestamp = opts.includeTimestamps
        ? `[${formatTimestamp(segment.startTime)}] `
        : '';

      let speakerLabel = '';
      if (opts.includeSpeakers && segment.speakerId) {
        const speaker = speakers.find((s) => s.id === segment.speakerId);
        speakerLabel = speaker ? `**${speaker.name}:** ` : '';
      }

      lines.push(`${timestamp}${speakerLabel}${segment.text}`);
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`_${l.generatedWith} - ${format(new Date(), 'dd.MM.yyyy HH:mm')}_`);

  return lines.join('\n');
}

// Export just the summary
export function exportSummaryToMarkdown(meeting: Meeting): string {
  return exportMeetingToMarkdown(meeting, [], [], {
    includeMetadata: true,
    includeAgenda: false,
    includeSummary: true,
    includeDecisions: true,
    includeTasks: false,
    includeQuestions: true,
    includeTranscript: false,
  });
}

// Export just tasks
export function exportTasksToMarkdown(tasks: Task[], meetingTitle: string): string {
  const lines: string[] = [];

  lines.push(`# Aufgaben: ${meetingTitle}`);
  lines.push('');
  lines.push(`_Erstellt am ${format(new Date(), 'dd.MM.yyyy')}_`);
  lines.push('');

  // Group by assignee
  const byAssignee = new Map<string, Task[]>();
  const unassigned: Task[] = [];

  for (const task of tasks) {
    if (task.assigneeName) {
      const current = byAssignee.get(task.assigneeName) || [];
      current.push(task);
      byAssignee.set(task.assigneeName, current);
    } else {
      unassigned.push(task);
    }
  }

  // Unassigned tasks
  if (unassigned.length > 0) {
    lines.push('## Nicht zugewiesen');
    lines.push('');
    for (const task of unassigned) {
      lines.push(`- [ ] ${task.title}`);
    }
    lines.push('');
  }

  // Tasks by assignee
  for (const [assignee, assigneeTasks] of byAssignee) {
    lines.push(`## ${assignee}`);
    lines.push('');
    for (const task of assigneeTasks) {
      const due = task.dueDate ? ` _(bis ${format(task.dueDate, 'dd.MM.')})_` : '';
      lines.push(`- [ ] ${task.title}${due}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Export for Obsidian (with YAML frontmatter)
export function exportForObsidian(
  meeting: Meeting,
  tasks: Task[],
  speakers: SpeakerProfile[]
): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`title: "${meeting.title}"`);
  lines.push(`date: ${format(meeting.createdAt, 'yyyy-MM-dd')}`);
  lines.push(`type: meeting`);
  lines.push(`status: ${meeting.status}`);

  if (meeting.tags && meeting.tags.length > 0) {
    lines.push(`tags: [${meeting.tags.map((t) => `"${t}"`).join(', ')}]`);
  }

  if (meeting.participantIds.length > 0) {
    const names = speakers
      .filter((s) => meeting.participantIds.includes(s.id))
      .map((s) => `"[[${s.name}]]"`);
    if (names.length > 0) {
      lines.push(`participants: [${names.join(', ')}]`);
    }
  }

  lines.push('---');
  lines.push('');

  // Regular markdown content
  lines.push(exportMeetingToMarkdown(meeting, tasks, speakers, {
    includeMetadata: false, // Already in frontmatter
  }));

  return lines.join('\n');
}

// Generate filename
export function generateMeetingFilename(meeting: Meeting, extension: string = 'md'): string {
  const dateStr = format(meeting.createdAt, 'yyyy-MM-dd');
  const titleSlug = meeting.title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  return `${dateStr}-${titleSlug}.${extension}`;
}
