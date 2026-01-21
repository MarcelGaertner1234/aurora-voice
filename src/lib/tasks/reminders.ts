// Task Reminders - Deadline management and notifications for Aurora Meeting Assistant

import { v4 as uuidv4 } from 'uuid';
import { getAllTasks } from '@/lib/db';
import type { Task, TaskStatus } from '@/types/task';

// Reminder types
export type ReminderType = 'due_soon' | 'overdue' | 'stale' | 'follow_up';
export type ReminderPriority = 'low' | 'medium' | 'high' | 'critical';

// Reminder configuration
export interface ReminderConfig {
  enableDueSoon: boolean;
  dueSoonDays: number; // Days before due date to remind
  enableOverdue: boolean;
  enableStale: boolean;
  staleDays: number; // Days without activity before considered stale
  enableFollowUp: boolean;
  followUpDays: number; // Days after task creation for follow-up
}

// Default reminder configuration
export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  enableDueSoon: true,
  dueSoonDays: 2,
  enableOverdue: true,
  enableStale: true,
  staleDays: 7,
  enableFollowUp: true,
  followUpDays: 3,
};

// Reminder
export interface Reminder {
  id: string;
  taskId: string;
  task: Task;
  type: ReminderType;
  priority: ReminderPriority;
  title: string;
  message: string;
  createdAt: Date;
  dueAt?: Date;
  dismissed: boolean;
  snoozedUntil?: Date;
}

// Reminder summary
export interface ReminderSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  dueSoon: number;
  overdue: number;
  stale: number;
  followUp: number;
}

// Reminder event callback
export type ReminderCallback = (reminder: Reminder) => void;

export class TaskReminders {
  private config: ReminderConfig;
  private reminders: Reminder[] = [];
  private dismissedIds: Set<string> = new Set();
  private snoozedMap: Map<string, Date> = new Map();
  private callbacks: ReminderCallback[] = [];
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ReminderConfig> = {}) {
    this.config = { ...DEFAULT_REMINDER_CONFIG, ...config };
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  // Update configuration
  updateConfig(config: Partial<ReminderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Get current configuration
  getConfig(): ReminderConfig {
    return { ...this.config };
  }

  // ============================================
  // REMINDER GENERATION
  // ============================================

  // Check all tasks and generate reminders
  async checkReminders(): Promise<Reminder[]> {
    const tasks = await getAllTasks();
    const now = new Date();
    const newReminders: Reminder[] = [];

    for (const task of tasks) {
      // Skip completed or cancelled tasks
      if (task.status === 'completed' || task.status === 'cancelled') continue;

      // Check due soon
      if (this.config.enableDueSoon && task.dueDate) {
        const reminder = this.checkDueSoon(task, now);
        if (reminder) newReminders.push(reminder);
      }

      // Check overdue
      if (this.config.enableOverdue && task.dueDate) {
        const reminder = this.checkOverdue(task, now);
        if (reminder) newReminders.push(reminder);
      }

      // Check stale
      if (this.config.enableStale) {
        const reminder = this.checkStale(task, now);
        if (reminder) newReminders.push(reminder);
      }

      // Check follow-up
      if (this.config.enableFollowUp) {
        const reminder = this.checkFollowUp(task, now);
        if (reminder) newReminders.push(reminder);
      }
    }

    // Filter out dismissed and snoozed reminders
    const activeReminders = newReminders.filter(r => {
      if (this.dismissedIds.has(r.id)) return false;

      const snoozedUntil = this.snoozedMap.get(r.id);
      if (snoozedUntil && snoozedUntil > now) return false;

      return true;
    });

    // Update stored reminders
    this.reminders = activeReminders;

    // Trigger callbacks for new reminders
    for (const reminder of activeReminders) {
      for (const callback of this.callbacks) {
        callback(reminder);
      }
    }

    return activeReminders;
  }

  private checkDueSoon(task: Task, now: Date): Reminder | null {
    if (!task.dueDate) return null;

    const dueDate = new Date(task.dueDate);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Only if due within configured days and not overdue
    if (diffDays > 0 && diffDays <= this.config.dueSoonDays) {
      const id = `due_soon_${task.id}`;
      const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));

      let timeText: string;
      if (hoursLeft < 24) {
        timeText = hoursLeft === 1 ? '1 Stunde' : `${hoursLeft} Stunden`;
      } else {
        const daysLeft = Math.ceil(diffDays);
        timeText = daysLeft === 1 ? '1 Tag' : `${daysLeft} Tage`;
      }

      return {
        id,
        taskId: task.id,
        task,
        type: 'due_soon',
        priority: diffDays <= 1 ? 'high' : 'medium',
        title: 'Fällig in Kürze',
        message: `"${task.title}" ist in ${timeText} fällig.`,
        createdAt: now,
        dueAt: dueDate,
        dismissed: false,
      };
    }

    return null;
  }

  private checkOverdue(task: Task, now: Date): Reminder | null {
    if (!task.dueDate) return null;

    const dueDate = new Date(task.dueDate);
    const diffMs = now.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Only if overdue
    if (diffDays >= 0) {
      const id = `overdue_${task.id}`;

      let timeText: string;
      if (diffDays === 0) {
        timeText = 'heute';
      } else if (diffDays === 1) {
        timeText = 'seit gestern';
      } else {
        timeText = `seit ${diffDays} Tagen`;
      }

      // Priority increases with how overdue
      let priority: ReminderPriority = 'high';
      if (diffDays > 7) priority = 'critical';
      else if (diffDays > 3) priority = 'high';
      else priority = 'medium';

      return {
        id,
        taskId: task.id,
        task,
        type: 'overdue',
        priority,
        title: 'Überfällig',
        message: `"${task.title}" ist ${timeText} überfällig.`,
        createdAt: now,
        dueAt: dueDate,
        dismissed: false,
      };
    }

    return null;
  }

  private checkStale(task: Task, now: Date): Reminder | null {
    const lastActivity = new Date(task.updatedAt);
    const diffMs = now.getTime() - lastActivity.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Only if stale beyond configured days
    if (diffDays >= this.config.staleDays) {
      const id = `stale_${task.id}_${Math.floor(diffDays / 7)}`; // New ID each week

      return {
        id,
        taskId: task.id,
        task,
        type: 'stale',
        priority: diffDays > 14 ? 'medium' : 'low',
        title: 'Keine Aktivität',
        message: `"${task.title}" wurde seit ${diffDays} Tagen nicht aktualisiert.`,
        createdAt: now,
        dismissed: false,
      };
    }

    return null;
  }

  private checkFollowUp(task: Task, now: Date): Reminder | null {
    // Only for pending tasks
    if (task.status !== 'pending') return null;

    const createdAt = new Date(task.createdAt);
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Only if created more than configured days ago
    if (diffDays >= this.config.followUpDays) {
      const id = `follow_up_${task.id}_${Math.floor(diffDays / 3)}`; // New ID every 3 days

      return {
        id,
        taskId: task.id,
        task,
        type: 'follow_up',
        priority: 'low',
        title: 'Follow-up',
        message: `"${task.title}" wurde vor ${diffDays} Tagen erstellt und ist noch ausstehend.`,
        createdAt: now,
        dismissed: false,
      };
    }

    return null;
  }

  // ============================================
  // REMINDER MANAGEMENT
  // ============================================

  // Get all active reminders
  getActiveReminders(): Reminder[] {
    const now = new Date();
    return this.reminders.filter(r => {
      if (r.dismissed) return false;
      if (r.snoozedUntil && r.snoozedUntil > now) return false;
      return true;
    });
  }

  // Get reminders by type
  getRemindersByType(type: ReminderType): Reminder[] {
    return this.getActiveReminders().filter(r => r.type === type);
  }

  // Get reminders for a specific task
  getRemindersForTask(taskId: string): Reminder[] {
    return this.getActiveReminders().filter(r => r.taskId === taskId);
  }

  // Dismiss a reminder
  dismissReminder(reminderId: string): void {
    this.dismissedIds.add(reminderId);
    this.reminders = this.reminders.map(r =>
      r.id === reminderId ? { ...r, dismissed: true } : r
    );
  }

  // Snooze a reminder
  snoozeReminder(reminderId: string, hours: number): void {
    const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    this.snoozedMap.set(reminderId, snoozedUntil);
    this.reminders = this.reminders.map(r =>
      r.id === reminderId ? { ...r, snoozedUntil } : r
    );
  }

  // Clear all dismissed reminders
  clearDismissed(): void {
    this.dismissedIds.clear();
  }

  // Clear all snoozed reminders
  clearSnoozed(): void {
    this.snoozedMap.clear();
  }

  // ============================================
  // SUMMARY AND STATISTICS
  // ============================================

  // Get reminder summary
  getSummary(): ReminderSummary {
    const active = this.getActiveReminders();

    return {
      total: active.length,
      critical: active.filter(r => r.priority === 'critical').length,
      high: active.filter(r => r.priority === 'high').length,
      medium: active.filter(r => r.priority === 'medium').length,
      low: active.filter(r => r.priority === 'low').length,
      dueSoon: active.filter(r => r.type === 'due_soon').length,
      overdue: active.filter(r => r.type === 'overdue').length,
      stale: active.filter(r => r.type === 'stale').length,
      followUp: active.filter(r => r.type === 'follow_up').length,
    };
  }

  // Get upcoming due dates
  async getUpcomingDueDates(days: number = 7): Promise<{ date: Date; tasks: Task[] }[]> {
    const tasks = await getAllTasks();
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Filter tasks with due dates in range
    const tasksWithDue = tasks.filter(t =>
      t.dueDate &&
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      new Date(t.dueDate) >= now &&
      new Date(t.dueDate) <= cutoff
    );

    // Group by date
    const byDate = new Map<string, Task[]>();
    for (const task of tasksWithDue) {
      const dateStr = new Date(task.dueDate!).toISOString().split('T')[0];
      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, []);
      }
      byDate.get(dateStr)!.push(task);
    }

    // Convert to array and sort
    return Array.from(byDate.entries())
      .map(([dateStr, dateTasks]) => ({
        date: new Date(dateStr),
        tasks: dateTasks,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ============================================
  // SCHEDULED CHECKING
  // ============================================

  // Start periodic reminder checking
  startPeriodicCheck(intervalMinutes: number = 15): void {
    if (this.checkInterval) {
      this.stopPeriodicCheck();
    }

    // Initial check
    this.checkReminders();

    // Schedule periodic checks
    this.checkInterval = setInterval(
      () => this.checkReminders(),
      intervalMinutes * 60 * 1000
    );
  }

  // Stop periodic checking
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ============================================
  // CALLBACKS
  // ============================================

  // Register a callback for new reminders
  onReminder(callback: ReminderCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index >= 0) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  // ============================================
  // BROWSER NOTIFICATIONS
  // ============================================

  // Request notification permission
  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  // Show browser notification for a reminder
  showNotification(reminder: Reminder): void {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      const notification = new Notification(reminder.title, {
        body: reminder.message,
        icon: '/icons/task-reminder.png',
        tag: reminder.id,
        requireInteraction: reminder.priority === 'critical' || reminder.priority === 'high',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        // Could navigate to task or tasks page here
      };
    }
  }

  // Enable automatic browser notifications
  enableBrowserNotifications(): () => void {
    return this.onReminder((reminder) => {
      if (reminder.priority === 'critical' || reminder.priority === 'high') {
        this.showNotification(reminder);
      }
    });
  }
}

// Create singleton instance
export const taskReminders = new TaskReminders();
