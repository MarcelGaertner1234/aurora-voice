// Task Manager - Advanced Task Management for Aurora Meeting Assistant

import { v4 as uuidv4 } from 'uuid';
import {
  getAllTasks,
  getTasksByMeetingId,
  getTasksByAssignee,
  saveTask,
  saveTasks,
  deleteTask as dbDeleteTask,
} from '@/lib/db';
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskFilters,
  TaskStats,
  TaskCreateInput,
  TaskUpdateInput,
} from '@/types/task';

// Task sorting options
export type TaskSortField = 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'status' | 'title';
export type TaskSortOrder = 'asc' | 'desc';

export interface TaskSortOptions {
  field: TaskSortField;
  order: TaskSortOrder;
}

// Task grouping options
export type TaskGroupBy = 'none' | 'status' | 'priority' | 'assignee' | 'meeting' | 'dueDate';

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  count: number;
}

// Bulk operation types
export type BulkOperation =
  | { type: 'status'; status: TaskStatus }
  | { type: 'priority'; priority: TaskPriority }
  | { type: 'assignee'; assigneeId: string; assigneeName?: string }
  | { type: 'dueDate'; dueDate: Date | undefined }
  | { type: 'addTag'; tag: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'delete' };

// Task timeline entry for history tracking
export interface TaskTimelineEntry {
  id: string;
  taskId: string;
  action: 'created' | 'updated' | 'status_changed' | 'assigned' | 'completed' | 'reopened' | 'deleted';
  details: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
}

// Priority weights for sorting
const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// Status weights for sorting
const STATUS_WEIGHTS: Record<TaskStatus, number> = {
  'in-progress': 4,
  pending: 3,
  completed: 2,
  cancelled: 1,
};

export class TaskManager {
  private timeline: TaskTimelineEntry[] = [];

  constructor() {
    // Initialize timeline from storage if needed
  }

  // ============================================
  // FILTERING AND SORTING
  // ============================================

  // Filter tasks with advanced criteria
  filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
    return tasks.filter((task) => {
      // Status filter
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        if (!statuses.includes(task.status)) return false;
      }

      // Priority filter
      if (filters.priority) {
        const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
        if (!priorities.includes(task.priority)) return false;
      }

      // Assignee filter
      if (filters.assigneeId && task.assigneeId !== filters.assigneeId) {
        return false;
      }

      // Meeting filter
      if (filters.meetingId && task.meetingId !== filters.meetingId) {
        return false;
      }

      // Due date filter
      if (filters.hasDueDate !== undefined) {
        const hasDue = task.dueDate !== undefined;
        if (filters.hasDueDate !== hasDue) return false;
      }

      // Overdue filter
      if (filters.overdue) {
        const now = new Date();
        const isOverdue =
          task.dueDate &&
          task.dueDate < now &&
          task.status !== 'completed' &&
          task.status !== 'cancelled';
        if (!isOverdue) return false;
      }

      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        if (!task.tags || !filters.tags.some((tag) => task.tags?.includes(tag))) {
          return false;
        }
      }

      // Search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDescription = task.description?.toLowerCase().includes(query);
        const matchesAssignee = task.assigneeName?.toLowerCase().includes(query);
        const matchesTags = task.tags?.some(t => t.toLowerCase().includes(query));
        if (!matchesTitle && !matchesDescription && !matchesAssignee && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }

  // Sort tasks
  sortTasks(tasks: Task[], options: TaskSortOptions): Task[] {
    const { field, order } = options;
    const sortedTasks = [...tasks];

    sortedTasks.sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'dueDate':
          // Tasks without due dates go to the end
          if (!a.dueDate && !b.dueDate) comparison = 0;
          else if (!a.dueDate) comparison = 1;
          else if (!b.dueDate) comparison = -1;
          else comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case 'priority':
          comparison = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
          break;
        case 'status':
          comparison = STATUS_WEIGHTS[b.status] - STATUS_WEIGHTS[a.status];
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sortedTasks;
  }

  // Group tasks
  groupTasks(tasks: Task[], groupBy: TaskGroupBy): TaskGroup[] {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'Alle Aufgaben', tasks, count: tasks.length }];
    }

    const groups = new Map<string, Task[]>();

    for (const task of tasks) {
      let key: string;

      switch (groupBy) {
        case 'status':
          key = task.status;
          break;
        case 'priority':
          key = task.priority;
          break;
        case 'assignee':
          key = task.assigneeId || task.assigneeName || 'unassigned';
          break;
        case 'meeting':
          key = task.meetingId;
          break;
        case 'dueDate':
          key = this.getDueDateGroup(task.dueDate);
          break;
        default:
          key = 'other';
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(task);
    }

    return Array.from(groups.entries()).map(([key, groupTasks]) => ({
      key,
      label: this.getGroupLabel(groupBy, key),
      tasks: groupTasks,
      count: groupTasks.length,
    }));
  }

  private getDueDateGroup(dueDate?: Date): string {
    if (!dueDate) return 'no_date';

    // Fix H13: Use UTC dates for consistent cross-timezone comparison
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(dueDate);
    const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());

    const diffDays = Math.floor((dueDay - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays <= 7) return 'this_week';
    if (diffDays <= 30) return 'this_month';
    return 'later';
  }

  private getGroupLabel(groupBy: TaskGroupBy, key: string): string {
    const labels: Record<string, Record<string, string>> = {
      status: {
        pending: 'Ausstehend',
        'in-progress': 'In Bearbeitung',
        completed: 'Abgeschlossen',
        cancelled: 'Abgebrochen',
      },
      priority: {
        urgent: 'Dringend',
        high: 'Hoch',
        medium: 'Mittel',
        low: 'Niedrig',
      },
      dueDate: {
        overdue: 'Überfällig',
        today: 'Heute',
        tomorrow: 'Morgen',
        this_week: 'Diese Woche',
        this_month: 'Diesen Monat',
        later: 'Später',
        no_date: 'Kein Datum',
      },
      assignee: {
        unassigned: 'Nicht zugewiesen',
      },
    };

    return labels[groupBy]?.[key] || key;
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  // Perform bulk operation on multiple tasks
  async bulkOperation(taskIds: string[], operation: BulkOperation): Promise<Task[]> {
    const tasks = await getAllTasks();
    const targetTasks = tasks.filter(t => taskIds.includes(t.id));
    const updatedTasks: Task[] = [];

    for (const task of targetTasks) {
      let updated: Task;

      switch (operation.type) {
        case 'status':
          updated = {
            ...task,
            status: operation.status,
            completedAt: operation.status === 'completed' ? new Date() : task.completedAt,
            updatedAt: new Date(),
          };
          break;

        case 'priority':
          updated = {
            ...task,
            priority: operation.priority,
            updatedAt: new Date(),
          };
          break;

        case 'assignee':
          updated = {
            ...task,
            assigneeId: operation.assigneeId,
            assigneeName: operation.assigneeName,
            updatedAt: new Date(),
          };
          break;

        case 'dueDate':
          updated = {
            ...task,
            dueDate: operation.dueDate,
            updatedAt: new Date(),
          };
          break;

        case 'addTag':
          updated = {
            ...task,
            tags: [...new Set([...(task.tags || []), operation.tag])],
            updatedAt: new Date(),
          };
          break;

        case 'removeTag':
          updated = {
            ...task,
            tags: (task.tags || []).filter(t => t !== operation.tag),
            updatedAt: new Date(),
          };
          break;

        case 'delete':
          await dbDeleteTask(task.id);
          this.recordTimeline(task.id, 'deleted', { title: task.title });
          continue;

        default:
          continue;
      }

      await saveTask(updated);
      updatedTasks.push(updated);
      this.recordTimeline(updated.id, 'updated', { operation: operation.type });
    }

    return updatedTasks;
  }

  // ============================================
  // STATISTICS AND ANALYTICS
  // ============================================

  // Calculate task statistics
  calculateStats(tasks: Task[]): TaskStats {
    const now = new Date();

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      overdue: tasks.filter(t =>
        t.dueDate &&
        t.dueDate < now &&
        t.status !== 'completed' &&
        t.status !== 'cancelled'
      ).length,
    };
  }

  // Get tasks per person statistics
  getTasksByPersonStats(tasks: Task[]): Map<string, TaskStats> {
    const personStats = new Map<string, TaskStats>();

    // Group tasks by assignee
    const tasksByPerson = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.assigneeId || task.assigneeName || 'unassigned';
      if (!tasksByPerson.has(key)) {
        tasksByPerson.set(key, []);
      }
      tasksByPerson.get(key)!.push(task);
    }

    // Calculate stats for each person
    for (const [person, personTasks] of tasksByPerson) {
      personStats.set(person, this.calculateStats(personTasks));
    }

    return personStats;
  }

  // Get tasks per meeting statistics
  getTasksByMeetingStats(tasks: Task[]): Map<string, TaskStats> {
    const meetingStats = new Map<string, TaskStats>();

    // Group tasks by meeting
    const tasksByMeeting = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!tasksByMeeting.has(task.meetingId)) {
        tasksByMeeting.set(task.meetingId, []);
      }
      tasksByMeeting.get(task.meetingId)!.push(task);
    }

    // Calculate stats for each meeting
    for (const [meetingId, meetingTasks] of tasksByMeeting) {
      meetingStats.set(meetingId, this.calculateStats(meetingTasks));
    }

    return meetingStats;
  }

  // Get productivity metrics
  getProductivityMetrics(tasks: Task[], days: number = 30): {
    completedPerDay: number;
    avgCompletionTime: number;
    overdueRate: number;
    completionRate: number;
  } {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const recentTasks = tasks.filter(t => new Date(t.createdAt) >= cutoff);
    const completedTasks = recentTasks.filter(t => t.status === 'completed' && t.completedAt);

    // Completed per day
    const completedPerDay = completedTasks.length / days;

    // Average completion time (in hours)
    let totalCompletionTime = 0;
    let completedWithTime = 0;
    for (const task of completedTasks) {
      if (task.completedAt) {
        totalCompletionTime += new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
        completedWithTime++;
      }
    }
    const avgCompletionTime = completedWithTime > 0
      ? totalCompletionTime / completedWithTime / (1000 * 60 * 60)
      : 0;

    // Overdue rate
    const overdueTasks = recentTasks.filter(t =>
      t.dueDate &&
      t.dueDate < now &&
      t.status !== 'completed' &&
      t.status !== 'cancelled'
    );
    const overdueRate = recentTasks.length > 0 ? overdueTasks.length / recentTasks.length : 0;

    // Completion rate
    const completionRate = recentTasks.length > 0 ? completedTasks.length / recentTasks.length : 0;

    return {
      completedPerDay,
      avgCompletionTime,
      overdueRate,
      completionRate,
    };
  }

  // ============================================
  // TIMELINE AND HISTORY
  // ============================================

  private recordTimeline(
    taskId: string,
    action: TaskTimelineEntry['action'],
    details: Record<string, unknown>
  ): void {
    this.timeline.push({
      id: uuidv4(),
      taskId,
      action,
      details,
      timestamp: new Date(),
    });

    // Keep only last 1000 entries
    if (this.timeline.length > 1000) {
      this.timeline = this.timeline.slice(-1000);
    }
  }

  getTaskTimeline(taskId: string): TaskTimelineEntry[] {
    return this.timeline.filter(e => e.taskId === taskId);
  }

  getRecentActivity(limit: number = 50): TaskTimelineEntry[] {
    return this.timeline.slice(-limit).reverse();
  }

  // ============================================
  // SMART FEATURES
  // ============================================

  // Get suggested priority based on content and due date
  suggestPriority(title: string, dueDate?: Date): TaskPriority {
    const lowerTitle = title.toLowerCase();

    // Urgent keywords
    if (/dringend|asap|sofort|urgent|critical|blocker/i.test(lowerTitle)) {
      return 'urgent';
    }

    // High priority keywords
    if (/wichtig|important|high priority|deadline/i.test(lowerTitle)) {
      return 'high';
    }

    // Check due date
    if (dueDate) {
      const now = new Date();
      const diffDays = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 1) return 'urgent';
      if (diffDays <= 3) return 'high';
      if (diffDays <= 7) return 'medium';
    }

    // Low priority keywords
    if (/irgendwann|optional|nice to have|low priority|when possible/i.test(lowerTitle)) {
      return 'low';
    }

    return 'medium';
  }

  // Get related tasks (same assignee, meeting, or similar title)
  getRelatedTasks(task: Task, allTasks: Task[], limit: number = 5): Task[] {
    const related: { task: Task; score: number }[] = [];
    const titleWords = new Set(task.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    for (const other of allTasks) {
      if (other.id === task.id) continue;

      let score = 0;

      // Same meeting
      if (other.meetingId === task.meetingId) score += 2;

      // Same assignee
      if (task.assigneeId && other.assigneeId === task.assigneeId) score += 2;

      // Similar tags
      if (task.tags && other.tags) {
        const commonTags = task.tags.filter(t => other.tags?.includes(t));
        score += commonTags.length;
      }

      // Similar title words
      const otherWords = new Set(other.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      for (const word of titleWords) {
        if (otherWords.has(word)) score += 0.5;
      }

      if (score > 0) {
        related.push({ task: other, score });
      }
    }

    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.task);
  }

  // Get all unique tags used across tasks
  getAllTags(tasks: Task[]): string[] {
    const tags = new Set<string>();
    for (const task of tasks) {
      if (task.tags) {
        for (const tag of task.tags) {
          tags.add(tag);
        }
      }
    }
    return Array.from(tags).sort();
  }

  // Get all unique assignees
  getAllAssignees(tasks: Task[]): { id?: string; name: string }[] {
    const assignees = new Map<string, { id?: string; name: string }>();

    for (const task of tasks) {
      const key = task.assigneeId || task.assigneeName || '';
      if (key && !assignees.has(key)) {
        assignees.set(key, {
          id: task.assigneeId,
          name: task.assigneeName || task.assigneeId || '',
        });
      }
    }

    return Array.from(assignees.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Create singleton instance
export const taskManager = new TaskManager();
