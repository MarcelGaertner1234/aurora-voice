// IndexedDB Storage Provider
// Wraps existing database operations as a StorageProvider

import type { Meeting, MeetingStatus } from '@/types/meeting';
import type { Task, TaskStatus } from '@/types/task';
import type { StorageProvider } from './provider';
import {
  getAllMeetings,
  getMeetingById,
  saveMeeting as dbSaveMeeting,
  deleteMeeting as dbDeleteMeeting,
  getMeetingsByStatus as dbGetMeetingsByStatus,
  getAllTasks,
  getTaskById,
  getTasksByMeetingId as dbGetTasksByMeetingId,
  getTasksByStatus as dbGetTasksByStatus,
  saveTask as dbSaveTask,
  saveTasks as dbSaveTasks,
  deleteTask as dbDeleteTask,
} from '@/lib/db';

export class IndexedDBStorageProvider implements StorageProvider {
  // === Meeting Operations ===

  async getMeeting(id: string): Promise<Meeting | undefined> {
    return getMeetingById(id);
  }

  async saveMeeting(meeting: Meeting): Promise<void> {
    await dbSaveMeeting(meeting);
  }

  async deleteMeeting(id: string): Promise<void> {
    await dbDeleteMeeting(id);
  }

  async listMeetings(): Promise<Meeting[]> {
    return getAllMeetings();
  }

  async getMeetingsByStatus(status: MeetingStatus): Promise<Meeting[]> {
    return dbGetMeetingsByStatus(status);
  }

  // === Task Operations ===

  async getTask(id: string): Promise<Task | undefined> {
    return getTaskById(id);
  }

  async saveTask(task: Task): Promise<void> {
    await dbSaveTask(task);
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    await dbSaveTasks(tasks);
  }

  async deleteTask(id: string): Promise<void> {
    await dbDeleteTask(id);
  }

  async getTasksForProject(): Promise<Task[]> {
    // IndexedDB provider returns all tasks (no project filtering)
    return getAllTasks();
  }

  async getTasksByMeetingId(meetingId: string): Promise<Task[]> {
    return dbGetTasksByMeetingId(meetingId);
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return dbGetTasksByStatus(status);
  }

  // === Provider Info ===

  getProviderType(): 'indexeddb' | 'project' {
    return 'indexeddb';
  }

  getIdentifier(): string {
    return 'indexeddb:AuroraMeetingAssistant';
  }
}

// Singleton instance for convenience
let indexedDBProviderInstance: IndexedDBStorageProvider | null = null;

export function getIndexedDBProvider(): IndexedDBStorageProvider {
  if (!indexedDBProviderInstance) {
    indexedDBProviderInstance = new IndexedDBStorageProvider();
  }
  return indexedDBProviderInstance;
}

export default IndexedDBStorageProvider;
