// Analytics Metrics for Aurora Voice
// Calculates meeting efficiency metrics and time savings

import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';

export interface MeetingMetrics {
  meetingId: string;
  date: Date;
  durationMinutes: number;
  transcriptWordCount: number;
  decisionsCount: number;
  questionsCount: number;
  tasksExtracted: number;
  keyPointsCount: number;
  estimatedTimeSavedMinutes: number;
  decisionVelocity: number; // Decisions per hour
}

export interface AggregatedMetrics {
  totalMeetings: number;
  totalDurationMinutes: number;
  totalTimeSavedMinutes: number;
  totalDecisions: number;
  totalQuestions: number;
  totalTasks: number;
  totalKeyPoints: number;
  avgDecisionsPerMeeting: number;
  avgTasksPerMeeting: number;
  avgDecisionVelocity: number;
  avgMeetingDuration: number;
}

export interface WeeklyMetrics {
  weekStart: Date;
  weekEnd: Date;
  meetingsCount: number;
  durationMinutes: number;
  timeSavedMinutes: number;
  decisionsCount: number;
  tasksCount: number;
}

export interface DayOfWeekActivity {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dayName: string;
  meetingsCount: number;
  totalDuration: number;
}

/**
 * Calculate metrics for a single meeting
 */
export function calculateMeetingMetrics(meeting: Meeting, tasks: Task[]): MeetingMetrics {
  const durationMinutes = meeting.startedAt && meeting.endedAt
    ? (meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60000
    : (meeting.transcript?.duration || 0) / 60000;

  const transcriptWordCount = meeting.transcript?.fullText
    ? meeting.transcript.fullText.split(/\s+/).filter(w => w.length > 0).length
    : 0;

  const decisionsCount = meeting.summary?.decisions?.length || 0;
  const questionsCount = meeting.summary?.openQuestions?.length || 0;
  const keyPointsCount = meeting.summary?.keyPoints?.length || 0;

  // Count tasks from this meeting
  const meetingTasks = tasks.filter(t => t.meetingId === meeting.id);
  const tasksExtracted = meetingTasks.length;

  // Time savings estimation:
  // - Manual note-taking: ~40 words per minute typing speed
  // - Manual summary writing: ~10 minutes for a typical meeting
  // - Manual task extraction: ~5 minutes
  // - AI does this in ~2 minutes total
  const manualTranscriptionTime = transcriptWordCount / 40; // Minutes
  const manualSummaryTime = meeting.summary ? 10 : 0;
  const manualTaskExtractionTime = tasksExtracted > 0 ? 5 : 0;
  const aiProcessingTime = 2; // Conservative estimate

  const estimatedTimeSavedMinutes = Math.max(0,
    manualTranscriptionTime + manualSummaryTime + manualTaskExtractionTime - aiProcessingTime
  );

  // Decision velocity: decisions per hour of meeting time
  const decisionVelocity = durationMinutes > 0
    ? (decisionsCount / durationMinutes) * 60
    : 0;

  return {
    meetingId: meeting.id,
    date: meeting.createdAt,
    durationMinutes,
    transcriptWordCount,
    decisionsCount,
    questionsCount,
    tasksExtracted,
    keyPointsCount,
    estimatedTimeSavedMinutes,
    decisionVelocity,
  };
}

/**
 * Aggregate metrics from multiple meetings
 */
export function aggregateMetrics(meetings: Meeting[], tasks: Task[]): AggregatedMetrics {
  const metricsArray = meetings
    .filter(m => m.status === 'completed')
    .map(m => calculateMeetingMetrics(m, tasks));

  if (metricsArray.length === 0) {
    return {
      totalMeetings: 0,
      totalDurationMinutes: 0,
      totalTimeSavedMinutes: 0,
      totalDecisions: 0,
      totalQuestions: 0,
      totalTasks: 0,
      totalKeyPoints: 0,
      avgDecisionsPerMeeting: 0,
      avgTasksPerMeeting: 0,
      avgDecisionVelocity: 0,
      avgMeetingDuration: 0,
    };
  }

  const totals = metricsArray.reduce(
    (acc, m) => ({
      durationMinutes: acc.durationMinutes + m.durationMinutes,
      timeSavedMinutes: acc.timeSavedMinutes + m.estimatedTimeSavedMinutes,
      decisions: acc.decisions + m.decisionsCount,
      questions: acc.questions + m.questionsCount,
      tasks: acc.tasks + m.tasksExtracted,
      keyPoints: acc.keyPoints + m.keyPointsCount,
      decisionVelocity: acc.decisionVelocity + m.decisionVelocity,
    }),
    {
      durationMinutes: 0,
      timeSavedMinutes: 0,
      decisions: 0,
      questions: 0,
      tasks: 0,
      keyPoints: 0,
      decisionVelocity: 0,
    }
  );

  const count = metricsArray.length;

  return {
    totalMeetings: count,
    totalDurationMinutes: totals.durationMinutes,
    totalTimeSavedMinutes: totals.timeSavedMinutes,
    totalDecisions: totals.decisions,
    totalQuestions: totals.questions,
    totalTasks: totals.tasks,
    totalKeyPoints: totals.keyPoints,
    avgDecisionsPerMeeting: totals.decisions / count,
    avgTasksPerMeeting: totals.tasks / count,
    avgDecisionVelocity: totals.decisionVelocity / count,
    avgMeetingDuration: totals.durationMinutes / count,
  };
}

/**
 * Get metrics grouped by week for trend analysis
 */
export function getWeeklyTrends(meetings: Meeting[], tasks: Task[], weeks: number = 4): WeeklyMetrics[] {
  const now = new Date();
  const result: WeeklyMetrics[] = [];

  for (let i = 0; i < weeks; i++) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - (i * 7));
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const weekMeetings = meetings.filter(m =>
      m.status === 'completed' &&
      m.createdAt >= weekStart &&
      m.createdAt <= weekEnd
    );

    const aggregated = aggregateMetrics(weekMeetings, tasks);

    result.unshift({
      weekStart,
      weekEnd,
      meetingsCount: aggregated.totalMeetings,
      durationMinutes: aggregated.totalDurationMinutes,
      timeSavedMinutes: aggregated.totalTimeSavedMinutes,
      decisionsCount: aggregated.totalDecisions,
      tasksCount: aggregated.totalTasks,
    });
  }

  return result;
}

/**
 * Get meeting activity by day of week
 */
export function getDayOfWeekActivity(meetings: Meeting[]): DayOfWeekActivity[] {
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  const activity: DayOfWeekActivity[] = dayNames.map((name, index) => ({
    dayOfWeek: index,
    dayName: name,
    meetingsCount: 0,
    totalDuration: 0,
  }));

  meetings
    .filter(m => m.status === 'completed')
    .forEach(m => {
      const dayIndex = m.createdAt.getDay();
      activity[dayIndex].meetingsCount++;

      if (m.startedAt && m.endedAt) {
        activity[dayIndex].totalDuration +=
          (m.endedAt.getTime() - m.startedAt.getTime()) / 60000;
      }
    });

  return activity;
}

/**
 * Calculate decision ratio (decided vs pending)
 */
export function getDecisionRatio(meetings: Meeting[]): { decided: number; pending: number } {
  let decided = 0;
  let pending = 0;

  meetings
    .filter(m => m.status === 'completed' && m.summary?.decisions)
    .forEach(m => {
      m.summary!.decisions!.forEach(d => {
        if (d.status === 'decided') {
          decided++;
        } else {
          pending++;
        }
      });
    });

  return { decided, pending };
}

/**
 * Calculate question resolution ratio
 */
export function getQuestionResolutionRatio(meetings: Meeting[]): { answered: number; open: number } {
  let answered = 0;
  let open = 0;

  meetings
    .filter(m => m.status === 'completed' && m.summary?.openQuestions)
    .forEach(m => {
      m.summary!.openQuestions!.forEach(q => {
        if (q.answered) {
          answered++;
        } else {
          open++;
        }
      });
    });

  return { answered, open };
}

/**
 * Format time duration for display
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} Min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours} Std`;
  }
  return `${hours} Std ${mins} Min`;
}

/**
 * Format time savings with appropriate unit
 */
export function formatTimeSaved(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} Minuten`;
  }
  const hours = minutes / 60;
  if (hours < 1) {
    return `${Math.round(minutes)} Minuten`;
  }
  return `${hours.toFixed(1)} Stunden`;
}
