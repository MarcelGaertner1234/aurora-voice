// Storage Provider Interface
// Abstraction layer for meeting and task storage

import type { Meeting, MeetingStatus } from '@/types/meeting';
import type { Task, TaskStatus } from '@/types/task';

// Storage Provider Interface - common operations for all storage backends
export interface StorageProvider {
  // === Meeting Operations ===
  getMeeting(id: string): Promise<Meeting | undefined>;
  saveMeeting(meeting: Meeting): Promise<void>;
  deleteMeeting(id: string): Promise<void>;
  listMeetings(): Promise<Meeting[]>;
  getMeetingsByStatus?(status: MeetingStatus): Promise<Meeting[]>;

  // === Task Operations ===
  getTask?(id: string): Promise<Task | undefined>;
  saveTask(task: Task): Promise<void>;
  saveTasks?(tasks: Task[]): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getTasksForProject(): Promise<Task[]>;
  getTasksByMeetingId?(meetingId: string): Promise<Task[]>;
  getTasksByStatus?(status: TaskStatus): Promise<Task[]>;

  // === Provider Info ===
  getProviderType(): 'indexeddb' | 'project';
  getIdentifier(): string;
}

// Provider with project-specific context operations
export interface ProjectStorageProviderInterface extends StorageProvider {
  // Project context operations
  hasAuroraFolder(): Promise<boolean>;
  initializeAuroraFolder(projectName: string): Promise<void>;
  isAnalysisStale(maxAgeHours?: number): Promise<boolean>;
}

// Storage routing decision helper
export interface StorageDecision {
  provider: StorageProvider;
  projectPath?: string;
  reason: 'has_project_path' | 'no_project_path' | 'orphan_meeting';
}
