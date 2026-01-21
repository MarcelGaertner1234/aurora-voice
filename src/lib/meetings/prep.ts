// Meeting Preparation Utilities for Aurora Meeting Assistant
// Helps users prepare for upcoming meetings

import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Settings } from '@/types';
import type { Meeting, AgendaItem } from '@/types/meeting';
import type { Task } from '@/types/task';
import { getAllMeetings, getTasksByStatus } from '@/lib/db';

// Get open tasks from previous meetings
export async function getOpenTasksFromPreviousMeetings(
  currentMeetingId?: string
): Promise<Task[]> {
  const openTasks = await getTasksByStatus('pending');
  const inProgressTasks = await getTasksByStatus('in-progress');

  // Combine and filter out tasks from current meeting
  return [...openTasks, ...inProgressTasks]
    .filter((task) => task.meetingId !== currentMeetingId)
    .sort((a, b) => {
      // Sort by priority first, then by due date
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Tasks with due dates come before those without
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }

      return 0;
    });
}

// Get related meetings (with same participants or tags)
export async function getRelatedMeetings(
  meeting: Meeting,
  limit: number = 5
): Promise<Meeting[]> {
  const allMeetings = await getAllMeetings();

  return allMeetings
    .filter((m) => m.id !== meeting.id && m.status === 'completed')
    .map((m) => {
      // Calculate relevance score
      let score = 0;

      // Check participant overlap
      const participantOverlap = m.participantIds.filter((p) =>
        meeting.participantIds.includes(p)
      ).length;
      score += participantOverlap * 2;

      // Check tag overlap
      if (meeting.tags && m.tags) {
        const tagOverlap = m.tags.filter((t) => meeting.tags?.includes(t)).length;
        score += tagOverlap * 3;
      }

      // Recency bonus (more recent = higher score)
      const daysSince = (Date.now() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 3;
      else if (daysSince < 30) score += 2;
      else if (daysSince < 90) score += 1;

      return { meeting: m, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.meeting);
}

// Get unresolved questions from previous meetings
export async function getUnresolvedQuestions(
  participantIds: string[]
): Promise<{ question: string; meetingTitle: string; meetingId: string }[]> {
  const allMeetings = await getAllMeetings();

  const questions: { question: string; meetingTitle: string; meetingId: string }[] = [];

  for (const meeting of allMeetings) {
    if (meeting.status !== 'completed' || !meeting.summary) continue;

    // Check if meeting has participant overlap
    const hasOverlap = participantIds.some((p) => meeting.participantIds.includes(p));
    if (!hasOverlap && participantIds.length > 0) continue;

    // Get unanswered questions
    for (const q of meeting.summary.openQuestions) {
      if (!q.answered) {
        questions.push({
          question: q.text,
          meetingTitle: meeting.title,
          meetingId: meeting.id,
        });
      }
    }
  }

  return questions.slice(0, 10); // Limit to 10 questions
}

// AI prompt for agenda suggestions
const AGENDA_SUGGESTION_PROMPT = `Du bist ein Meeting-Vorbereitungs-Assistent. Basierend auf den folgenden Informationen, schlage eine sinnvolle Meeting-Agenda vor.

Informationen:
- Meeting-Titel: {title}
- Beschreibung: {description}
- Offene Aufgaben aus vorherigen Meetings: {openTasks}
- Offene Fragen: {openQuestions}

Erstelle eine Agenda mit 3-6 Punkten. Jeder Punkt sollte:
- Einen klaren Titel haben
- Optional eine kurze Beschreibung
- Eine geschätzte Dauer in Minuten (5, 10, 15, 20, 30)

Antworte NUR mit einem JSON-Array im folgenden Format:
[
  {
    "title": "Agenda-Punkt",
    "description": "Optionale Beschreibung",
    "duration": 10
  }
]

Keine zusätzlichen Erklärungen, nur das JSON-Array.`;

function getModel(settings: Settings) {
  const { selectedProvider, selectedModel, openaiApiKey, anthropicApiKey, ollamaBaseUrl } = settings;

  switch (selectedProvider) {
    case 'openai': {
      if (!openaiApiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey: openaiApiKey });
      return openai(selectedModel || 'gpt-4o');
    }
    case 'anthropic': {
      if (!anthropicApiKey) throw new Error('Anthropic API key is required');
      const anthropic = createAnthropic({ apiKey: anthropicApiKey });
      return anthropic(selectedModel || 'claude-sonnet-4-20250514');
    }
    case 'ollama': {
      const openai = createOpenAI({
        baseURL: `${ollamaBaseUrl}/v1`,
        apiKey: 'ollama',
      });
      return openai(selectedModel || 'llama3.2');
    }
    default:
      throw new Error(`Unknown provider: ${selectedProvider}`);
  }
}

// Generate agenda suggestions using AI
export async function generateAgendaSuggestions(
  meeting: Meeting,
  openTasks: Task[],
  openQuestions: { question: string; meetingTitle: string }[],
  settings: Settings
): Promise<Omit<AgendaItem, 'id' | 'completed' | 'order'>[]> {
  const model = getModel(settings);

  // Format open tasks
  const tasksText = openTasks.length > 0
    ? openTasks.slice(0, 5).map((t) => `- ${t.title}${t.assigneeName ? ` (${t.assigneeName})` : ''}`).join('\n')
    : 'Keine offenen Aufgaben';

  // Format open questions
  const questionsText = openQuestions.length > 0
    ? openQuestions.slice(0, 5).map((q) => `- ${q.question} (aus: ${q.meetingTitle})`).join('\n')
    : 'Keine offenen Fragen';

  const prompt = AGENDA_SUGGESTION_PROMPT
    .replace('{title}', meeting.title)
    .replace('{description}', meeting.description || 'Keine Beschreibung')
    .replace('{openTasks}', tasksText)
    .replace('{openQuestions}', questionsText);

  const { textStream } = streamText({
    model,
    prompt,
  });

  let fullText = '';
  try {
    for await (const chunk of textStream) {
      fullText += chunk;
    }
  } catch (err) {
    console.error('Error during agenda suggestion stream:', err);
    // Return empty suggestions on stream error instead of crashing
    return [];
  }

  return parseAgendaSuggestions(fullText);
}

// Parse AI response for agenda suggestions
function parseAgendaSuggestions(response: string): Omit<AgendaItem, 'id' | 'completed' | 'order'>[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in agenda suggestions response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        title: String(item.title || 'Untitled'),
        description: item.description ? String(item.description) : undefined,
        duration: typeof item.duration === 'number' ? item.duration : 10,
      }));
  } catch (err) {
    console.error('Failed to parse agenda suggestions:', err);
    return [];
  }
}

// Generate discussion checklist based on open items
export function generateDiscussionChecklist(
  openTasks: Task[],
  openQuestions: { question: string; meetingTitle: string }[]
): { type: 'task' | 'question'; text: string; source?: string }[] {
  const checklist: { type: 'task' | 'question'; text: string; source?: string }[] = [];

  // Add high-priority tasks
  for (const task of openTasks.filter((t) => t.priority === 'high' || t.priority === 'urgent')) {
    checklist.push({
      type: 'task',
      text: task.title,
      source: task.assigneeName || undefined,
    });
  }

  // Add open questions
  for (const q of openQuestions) {
    checklist.push({
      type: 'question',
      text: q.question,
      source: q.meetingTitle,
    });
  }

  // Add remaining tasks
  for (const task of openTasks.filter((t) => t.priority !== 'high' && t.priority !== 'urgent')) {
    if (checklist.length >= 10) break;
    checklist.push({
      type: 'task',
      text: task.title,
      source: task.assigneeName || undefined,
    });
  }

  return checklist;
}

// Calculate estimated meeting duration from agenda
export function calculateEstimatedDuration(agenda: AgendaItem[]): number {
  const agendaTime = agenda.reduce((sum, item) => sum + (item.duration || 10), 0);
  // Add 10% buffer for transitions and discussions
  return Math.ceil(agendaTime * 1.1);
}

// Get preparation summary
export interface PrepSummary {
  openTasks: Task[];
  openQuestions: { question: string; meetingTitle: string; meetingId: string }[];
  relatedMeetings: Meeting[];
  discussionChecklist: { type: 'task' | 'question'; text: string; source?: string }[];
  estimatedDuration: number;
}

export async function getMeetingPrepSummary(meeting: Meeting): Promise<PrepSummary> {
  const [openTasks, openQuestions, relatedMeetings] = await Promise.all([
    getOpenTasksFromPreviousMeetings(meeting.id),
    getUnresolvedQuestions(meeting.participantIds),
    getRelatedMeetings(meeting),
  ]);

  const discussionChecklist = generateDiscussionChecklist(openTasks, openQuestions);
  const estimatedDuration = calculateEstimatedDuration(meeting.agenda);

  return {
    openTasks,
    openQuestions,
    relatedMeetings,
    discussionChecklist,
    estimatedDuration,
  };
}
