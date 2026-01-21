// Task Tracker - Cross-meeting task tracking and history for Aurora Meeting Assistant

import { v4 as uuidv4 } from 'uuid';
import {
  getAllTasks,
  getTasksByMeetingId,
  getTasksByAssignee,
  getMeetingById,
} from '@/lib/db';
import type { Task, TaskStatus, TaskStats } from '@/types/task';
import type { Meeting } from '@/types/meeting';

// Task history entry
export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: Date;
  meetingId?: string;
}

// Task journey - tracks a task across meetings
export interface TaskJourney {
  taskId: string;
  task: Task;
  meetings: {
    meetingId: string;
    meetingTitle: string;
    mentionedAt: Date;
    status: TaskStatus;
    discussed: boolean;
  }[];
  firstMentioned: Date;
  lastMentioned: Date;
  totalMentions: number;
}

// Person task summary
export interface PersonTaskSummary {
  personId: string;
  personName: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionRate: number;
  avgCompletionTimeHours: number;
  tasksByMeeting: Map<string, number>;
}

// Meeting task summary
export interface MeetingTaskSummary {
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  newTasksCreated: number;
  tasksClosed: number;
  tasksByPerson: Map<string, number>;
}

// Task carry-over info (tasks not completed from previous meetings)
export interface TaskCarryOver {
  task: Task;
  originalMeetingId: string;
  originalMeetingTitle: string;
  daysOpen: number;
  mentionCount: number;
}

export class TaskTracker {
  private history: TaskHistoryEntry[] = [];

  constructor() {
    // Initialize history from storage if needed
  }

  // ============================================
  // TASK HISTORY
  // ============================================

  // Record a change to a task
  recordChange(
    taskId: string,
    field: string,
    oldValue: unknown,
    newValue: unknown,
    meetingId?: string
  ): void {
    this.history.push({
      id: uuidv4(),
      taskId,
      field,
      oldValue,
      newValue,
      changedAt: new Date(),
      meetingId,
    });

    // Keep only last 5000 entries
    if (this.history.length > 5000) {
      this.history = this.history.slice(-5000);
    }
  }

  // Get history for a specific task
  getTaskHistory(taskId: string): TaskHistoryEntry[] {
    return this.history
      .filter(h => h.taskId === taskId)
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }

  // Get all history entries for a meeting
  getMeetingHistory(meetingId: string): TaskHistoryEntry[] {
    return this.history
      .filter(h => h.meetingId === meetingId)
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }

  // ============================================
  // CROSS-MEETING TRACKING
  // ============================================

  // Get task journey across meetings
  async getTaskJourney(taskId: string): Promise<TaskJourney | null> {
    const tasks = await getAllTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task) return null;

    // In a full implementation, we'd track when the task was mentioned in each meeting
    // For now, we just track the original meeting
    const meeting = await getMeetingById(task.meetingId);

    const journey: TaskJourney = {
      taskId,
      task,
      meetings: [{
        meetingId: task.meetingId,
        meetingTitle: meeting?.title || 'Unknown Meeting',
        mentionedAt: new Date(task.createdAt),
        status: task.status,
        discussed: true,
      }],
      firstMentioned: new Date(task.createdAt),
      lastMentioned: new Date(task.updatedAt),
      totalMentions: 1,
    };

    return journey;
  }

  // Get carry-over tasks (open tasks from previous meetings)
  async getCarryOverTasks(currentMeetingId: string): Promise<TaskCarryOver[]> {
    const tasks = await getAllTasks();
    const currentMeeting = await getMeetingById(currentMeetingId);
    const carryOvers: TaskCarryOver[] = [];

    const now = new Date();
    const openStatuses: TaskStatus[] = ['pending', 'in-progress'];

    for (const task of tasks) {
      // Skip tasks from current meeting
      if (task.meetingId === currentMeetingId) continue;

      // Only include open tasks
      if (!openStatuses.includes(task.status)) continue;

      // Skip if current meeting is older than task creation
      if (currentMeeting && new Date(currentMeeting.createdAt) < new Date(task.createdAt)) {
        continue;
      }

      const originalMeeting = await getMeetingById(task.meetingId);
      const daysOpen = Math.floor(
        (now.getTime() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      carryOvers.push({
        task,
        originalMeetingId: task.meetingId,
        originalMeetingTitle: originalMeeting?.title || 'Unknown Meeting',
        daysOpen,
        mentionCount: 1, // Would be higher if tracked across meetings
      });
    }

    // Sort by days open (oldest first)
    return carryOvers.sort((a, b) => b.daysOpen - a.daysOpen);
  }

  // ============================================
  // PERSON ANALYTICS
  // ============================================

  // Get task summary for a person
  async getPersonSummary(personId: string): Promise<PersonTaskSummary | null> {
    const tasks = await getTasksByAssignee(personId);

    if (tasks.length === 0) return null;

    const now = new Date();
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress');
    const overdueTasks = tasks.filter(t =>
      t.dueDate &&
      t.dueDate < now &&
      t.status !== 'completed' &&
      t.status !== 'cancelled'
    );

    // Calculate average completion time
    let totalCompletionTime = 0;
    let completedWithTime = 0;
    for (const task of completedTasks) {
      if (task.completedAt) {
        totalCompletionTime += new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
        completedWithTime++;
      }
    }

    // Tasks by meeting
    const tasksByMeeting = new Map<string, number>();
    for (const task of tasks) {
      const count = tasksByMeeting.get(task.meetingId) || 0;
      tasksByMeeting.set(task.meetingId, count + 1);
    }

    // Get person name from first task
    const personName = tasks[0].assigneeName || personId;

    return {
      personId,
      personName,
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      pendingTasks: pendingTasks.length,
      overdueTasks: overdueTasks.length,
      completionRate: tasks.length > 0 ? completedTasks.length / tasks.length : 0,
      avgCompletionTimeHours: completedWithTime > 0
        ? totalCompletionTime / completedWithTime / (1000 * 60 * 60)
        : 0,
      tasksByMeeting,
    };
  }

  // Get all person summaries
  async getAllPersonSummaries(): Promise<PersonTaskSummary[]> {
    const tasks = await getAllTasks();
    const personIds = new Set<string>();

    for (const task of tasks) {
      if (task.assigneeId) {
        personIds.add(task.assigneeId);
      }
    }

    const summaries: PersonTaskSummary[] = [];
    for (const personId of personIds) {
      const summary = await this.getPersonSummary(personId);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries.sort((a, b) => b.totalTasks - a.totalTasks);
  }

  // ============================================
  // MEETING ANALYTICS
  // ============================================

  // Get task summary for a meeting
  async getMeetingSummary(meetingId: string): Promise<MeetingTaskSummary | null> {
    const meeting = await getMeetingById(meetingId);
    const tasks = await getTasksByMeetingId(meetingId);

    if (!meeting) return null;

    const completedTasks = tasks.filter(t => t.status === 'completed');
    const openTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress');

    // Tasks by person
    const tasksByPerson = new Map<string, number>();
    for (const task of tasks) {
      const personKey = task.assigneeId || task.assigneeName || 'unassigned';
      const count = tasksByPerson.get(personKey) || 0;
      tasksByPerson.set(personKey, count + 1);
    }

    // Calculate new tasks created and closed during meeting
    // (In a full implementation, we'd track when tasks were created/closed)
    const newTasksCreated = tasks.length;
    const tasksClosed = completedTasks.length;

    return {
      meetingId,
      meetingTitle: meeting.title,
      meetingDate: new Date(meeting.createdAt),
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      openTasks: openTasks.length,
      newTasksCreated,
      tasksClosed,
      tasksByPerson,
    };
  }

  // Get meeting summaries over time
  async getMeetingSummariesOverTime(limit: number = 10): Promise<MeetingTaskSummary[]> {
    const tasks = await getAllTasks();
    const meetingIds = new Set<string>();

    for (const task of tasks) {
      meetingIds.add(task.meetingId);
    }

    const summaries: MeetingTaskSummary[] = [];
    for (const meetingId of meetingIds) {
      const summary = await this.getMeetingSummary(meetingId);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries
      .sort((a, b) => b.meetingDate.getTime() - a.meetingDate.getTime())
      .slice(0, limit);
  }

  // ============================================
  // TRENDS AND INSIGHTS
  // ============================================

  // Get task completion trend over time
  async getCompletionTrend(
    days: number = 30
  ): Promise<{ date: string; created: number; completed: number }[]> {
    const tasks = await getAllTasks();
    const now = new Date();
    const trend: Map<string, { created: number; completed: number }> = new Map();

    // Initialize all days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      trend.set(dateStr, { created: 0, completed: 0 });
    }

    // Count created and completed tasks per day
    for (const task of tasks) {
      const createdDate = new Date(task.createdAt).toISOString().split('T')[0];
      if (trend.has(createdDate)) {
        trend.get(createdDate)!.created++;
      }

      if (task.completedAt) {
        const completedDate = new Date(task.completedAt).toISOString().split('T')[0];
        if (trend.has(completedDate)) {
          trend.get(completedDate)!.completed++;
        }
      }
    }

    return Array.from(trend.entries()).map(([date, data]) => ({
      date,
      created: data.created,
      completed: data.completed,
    }));
  }

  // Get overdue trend
  async getOverdueTrend(days: number = 30): Promise<{ date: string; overdue: number }[]> {
    const tasks = await getAllTasks();
    const now = new Date();
    const trend: Map<string, number> = new Map();

    // Initialize all days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      trend.set(dateStr, 0);
    }

    // For each day, count how many tasks were overdue
    for (const [dateStr] of trend) {
      const checkDate = new Date(dateStr);
      checkDate.setHours(23, 59, 59, 999);

      let overdueCount = 0;
      for (const task of tasks) {
        if (!task.dueDate) continue;
        if (task.status === 'completed' || task.status === 'cancelled') continue;

        const dueDate = new Date(task.dueDate);
        const createdDate = new Date(task.createdAt);

        // Task was overdue on this date if:
        // 1. Task was created before or on this date
        // 2. Task due date is before this date
        // 3. Task wasn't completed before this date
        if (createdDate <= checkDate && dueDate < checkDate) {
          if (!task.completedAt || new Date(task.completedAt) > checkDate) {
            overdueCount++;
          }
        }
      }

      trend.set(dateStr, overdueCount);
    }

    return Array.from(trend.entries()).map(([date, overdue]) => ({
      date,
      overdue,
    }));
  }

  // Get productivity insights
  async getProductivityInsights(): Promise<{
    busiestDay: string;
    mostProductivePerson: string | null;
    avgTasksPerMeeting: number;
    mostCommonTag: string | null;
    completionTrend: 'improving' | 'declining' | 'stable';
  }> {
    const tasks = await getAllTasks();

    // Busiest day of week
    const dayCount = new Map<number, number>();
    for (const task of tasks) {
      const day = new Date(task.createdAt).getDay();
      dayCount.set(day, (dayCount.get(day) || 0) + 1);
    }
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    let busiestDayNum = 0;
    let maxCount = 0;
    for (const [day, count] of dayCount) {
      if (count > maxCount) {
        maxCount = count;
        busiestDayNum = day;
      }
    }
    const busiestDay = days[busiestDayNum];

    // Most productive person (highest completion rate with min 5 tasks)
    const personSummaries = await this.getAllPersonSummaries();
    const qualifiedPersons = personSummaries.filter(p => p.totalTasks >= 5);
    const mostProductivePerson = qualifiedPersons.length > 0
      ? qualifiedPersons.sort((a, b) => b.completionRate - a.completionRate)[0].personName
      : null;

    // Average tasks per meeting
    const meetingIds = new Set(tasks.map(t => t.meetingId));
    const avgTasksPerMeeting = meetingIds.size > 0 ? tasks.length / meetingIds.size : 0;

    // Most common tag
    const tagCount = new Map<string, number>();
    for (const task of tasks) {
      if (task.tags) {
        for (const tag of task.tags) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      }
    }
    let mostCommonTag: string | null = null;
    let maxTagCount = 0;
    for (const [tag, count] of tagCount) {
      if (count > maxTagCount) {
        maxTagCount = count;
        mostCommonTag = tag;
      }
    }

    // Completion trend (compare last 15 days to previous 15 days)
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentCompleted = tasks.filter(t =>
      t.completedAt && new Date(t.completedAt) >= fifteenDaysAgo
    ).length;
    const previousCompleted = tasks.filter(t =>
      t.completedAt &&
      new Date(t.completedAt) >= thirtyDaysAgo &&
      new Date(t.completedAt) < fifteenDaysAgo
    ).length;

    let completionTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (recentCompleted > previousCompleted * 1.2) {
      completionTrend = 'improving';
    } else if (recentCompleted < previousCompleted * 0.8) {
      completionTrend = 'declining';
    }

    return {
      busiestDay,
      mostProductivePerson,
      avgTasksPerMeeting,
      mostCommonTag,
      completionTrend,
    };
  }
}

// Create singleton instance
export const taskTracker = new TaskTracker();
