// IndexedDB Setup with Dexie.js for Aurora Meeting Assistant

import Dexie, { type Table } from 'dexie';
import type { Meeting, Transcript, MeetingSummary, AgendaItem, MeetingRecording } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';
import { convertToPlayableFormat } from '../audio/recorder';

// Database schema version
const DB_VERSION = 2;

// Stored types (with serialized dates as ISO strings for IndexedDB)
export interface StoredMeeting extends Omit<Meeting, 'scheduledAt' | 'startedAt' | 'endedAt' | 'createdAt' | 'updatedAt' | 'summary'> {
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  summary?: Omit<MeetingSummary, 'generatedAt'> & { generatedAt: string };
}

export interface StoredTask extends Omit<Task, 'dueDate' | 'completedAt' | 'createdAt' | 'updatedAt'> {
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSpeaker extends Omit<SpeakerProfile, 'createdAt' | 'updatedAt' | 'lastSeenAt'> {
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
}

// Stored recording (ArrayBuffer stored in IndexedDB to avoid WebKitBlobResource issues)
export interface StoredRecording extends Omit<MeetingRecording, 'createdAt' | 'blob'> {
  meetingId: string;  // Reference to parent meeting
  createdAt: string;
  audioData: ArrayBuffer;  // Blob als ArrayBuffer speichern
  blob?: Blob;  // Legacy field for migration
}

// Dexie Database Class
class AuroraDatabase extends Dexie {
  meetings!: Table<StoredMeeting, string>;
  tasks!: Table<StoredTask, string>;
  speakers!: Table<StoredSpeaker, string>;
  recordings!: Table<StoredRecording, string>;

  constructor() {
    super('AuroraMeetingAssistant');

    // Version 1: Initial schema
    this.version(1).stores({
      meetings: 'id, status, phase, createdAt, scheduledAt, *participantIds, *tags',
      tasks: 'id, meetingId, status, priority, assigneeId, dueDate, createdAt',
      speakers: 'id, name, createdAt, lastSeenAt',
    });

    // Version 2: Add recordings store
    this.version(DB_VERSION).stores({
      // Meetings: indexed by id, status, phase, createdAt
      meetings: 'id, status, phase, createdAt, scheduledAt, *participantIds, *tags',
      // Tasks: indexed by id, meetingId, status, priority, assigneeId, dueDate
      tasks: 'id, meetingId, status, priority, assigneeId, dueDate, createdAt',
      // Speakers: indexed by id, name
      speakers: 'id, name, createdAt, lastSeenAt',
      // Recordings: indexed by id, meetingId, createdAt
      recordings: 'id, meetingId, createdAt',
    });
  }
}

// Helper: Check if database needs migration using native IndexedDB API
async function checkAndMigrateDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if we're in a browser environment
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }

    const DB_NAME = 'AuroraMeetingAssistant';
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const hasRecordings = db.objectStoreNames.contains('recordings');
      const version = db.version;
      db.close();

      console.log(`Database check: version=${version}, hasRecordings=${hasRecordings}`);

      if (!hasRecordings) {
        console.warn('Recordings table missing, deleting database for fresh start...');
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          console.log('Old database deleted successfully');
          resolve();
        };
        deleteRequest.onerror = () => {
          console.error('Failed to delete old database');
          resolve(); // Continue anyway
        };
        deleteRequest.onblocked = () => {
          console.warn('Database delete blocked, continuing...');
          resolve();
        };
      } else {
        resolve();
      }
    };

    request.onerror = () => {
      // Database doesn't exist yet, that's fine
      resolve();
    };

    request.onupgradeneeded = () => {
      // New database, close and let Dexie handle it
      request.transaction?.abort();
      resolve();
    };
  });
}

// Singleton database instance
export const db = new AuroraDatabase();

// Track recordings currently being migrated to prevent race conditions
const migratingRecordings = new Set<string>();

// Promise that resolves when database is ready (opened and upgraded)
export const dbReady: Promise<void> = (async () => {
  // First, check and migrate if needed
  await checkAndMigrateDatabase();

  try {
    await db.open();
    console.log('Database opened successfully, version:', db.verno);
  } catch (err) {
    console.error('Failed to open database:', err);
    // If any error, try to delete and recreate
    console.warn('Database error, attempting recovery by deleting and recreating...');
    try {
      db.close();
    } catch (closeErr) {
      console.warn('Failed to close database during recovery:', closeErr);
    }

    // Fix: Wrap recovery operations in try-catch with proper logging
    try {
      await db.delete();
      console.log('Database deleted successfully during recovery');
    } catch (deleteErr) {
      console.error('Failed to delete database during recovery:', deleteErr);
      throw new Error(`Database recovery failed: could not delete database - ${deleteErr}`);
    }

    try {
      await db.open();
      console.log('Database recreated successfully');
    } catch (reopenErr) {
      console.error('Failed to reopen database during recovery:', reopenErr);
      throw new Error(`Database recovery failed: could not reopen database - ${reopenErr}`);
    }
  }
})();

// Helper functions for date serialization
export function serializeMeeting(meeting: Meeting): StoredMeeting {
  return {
    ...meeting,
    scheduledAt: meeting.scheduledAt?.toISOString(),
    startedAt: meeting.startedAt?.toISOString(),
    endedAt: meeting.endedAt?.toISOString(),
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    summary: meeting.summary ? {
      ...meeting.summary,
      generatedAt: meeting.summary.generatedAt.toISOString(),
    } : undefined,
  };
}

export function deserializeMeeting(stored: StoredMeeting): Meeting {
  return {
    ...stored,
    scheduledAt: stored.scheduledAt ? new Date(stored.scheduledAt) : undefined,
    startedAt: stored.startedAt ? new Date(stored.startedAt) : undefined,
    endedAt: stored.endedAt ? new Date(stored.endedAt) : undefined,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
    summary: stored.summary ? {
      ...stored.summary,
      generatedAt: new Date(stored.summary.generatedAt),
    } : undefined,
  };
}

export function serializeTask(task: Task): StoredTask {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function deserializeTask(stored: StoredTask): Task {
  return {
    ...stored,
    dueDate: stored.dueDate ? new Date(stored.dueDate) : undefined,
    completedAt: stored.completedAt ? new Date(stored.completedAt) : undefined,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
  };
}

export function serializeSpeaker(speaker: SpeakerProfile): StoredSpeaker {
  return {
    ...speaker,
    createdAt: speaker.createdAt.toISOString(),
    updatedAt: speaker.updatedAt.toISOString(),
    lastSeenAt: speaker.lastSeenAt?.toISOString(),
  };
}

export function deserializeSpeaker(stored: StoredSpeaker): SpeakerProfile {
  return {
    ...stored,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
    lastSeenAt: stored.lastSeenAt ? new Date(stored.lastSeenAt) : undefined,
  };
}

export async function serializeRecording(recording: MeetingRecording, meetingId: string): Promise<StoredRecording> {
  try {
    const audioData = await recording.blob.arrayBuffer();
    if (!audioData || audioData.byteLength === 0) {
      throw new Error('ArrayBuffer conversion resulted in empty data');
    }
    console.log('Serialized recording:', {
      id: recording.id,
      originalBlobSize: recording.blob.size,
      arrayBufferSize: audioData.byteLength,
    });
    return {
      id: recording.id,
      meetingId,
      mimeType: recording.mimeType,
      duration: recording.duration,
      createdAt: recording.createdAt.toISOString(),
      audioData,
      transcriptSegmentIds: recording.transcriptSegmentIds,
    };
  } catch (err) {
    console.error('Failed to serialize recording:', err);
    throw err;
  }
}

export async function deserializeRecording(stored: StoredRecording): Promise<MeetingRecording & { meetingId: string }> {
  console.log('Deserializing recording:', {
    id: stored.id,
    audioDataSize: stored.audioData?.byteLength,
    mimeType: stored.mimeType,
  });

  if (!stored.audioData || stored.audioData.byteLength === 0) {
    throw new Error(`No audioData in stored recording ${stored.id}`);
  }

  const blob = new Blob([stored.audioData], { type: stored.mimeType });

  if (blob.size === 0) {
    throw new Error(`Created blob has zero size for recording ${stored.id}`);
  }

  // Create Data URL for WebKit-compatible playback (avoids createObjectURL issues in Tauri/Safari)
  // FileReader with timeout to handle large blobs
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`FileReader timeout after 30s for recording ${stored.id}`));
    }, 30000);

    const reader = new FileReader();
    reader.onloadend = () => {
      clearTimeout(timeout);
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error(`FileReader returned null result for recording ${stored.id}`));
      }
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      reject(reader.error || new Error(`FileReader error for recording ${stored.id}`));
    };
    reader.readAsDataURL(blob);
  });

  console.log('Deserialized recording successfully:', {
    id: stored.id,
    blobSize: blob.size,
    dataUrlLength: dataUrl.length,
  });

  return {
    id: stored.id,
    meetingId: stored.meetingId,
    blob,
    mimeType: stored.mimeType,
    duration: stored.duration,
    createdAt: new Date(stored.createdAt),
    transcriptSegmentIds: stored.transcriptSegmentIds,
    dataUrl,
  };
}

// Database operations (all wait for database to be ready)

// Meetings
export async function getAllMeetings(): Promise<Meeting[]> {
  await dbReady;
  const stored = await db.meetings.orderBy('createdAt').reverse().toArray();
  return stored.map(deserializeMeeting);
}

export async function getMeetingById(id: string): Promise<Meeting | undefined> {
  await dbReady;
  const stored = await db.meetings.get(id);
  return stored ? deserializeMeeting(stored) : undefined;
}

export async function saveMeeting(meeting: Meeting): Promise<void> {
  await dbReady;
  await db.meetings.put(serializeMeeting(meeting));
}

export async function deleteMeeting(id: string): Promise<void> {
  await dbReady;
  await db.transaction('rw', [db.meetings, db.tasks, db.recordings], async () => {
    // Delete associated recordings first
    await db.recordings.where('meetingId').equals(id).delete();
    // Delete associated tasks
    await db.tasks.where('meetingId').equals(id).delete();
    // Delete meeting
    await db.meetings.delete(id);
  });
}

export async function getMeetingsByStatus(status: string): Promise<Meeting[]> {
  await dbReady;
  const stored = await db.meetings.where('status').equals(status).toArray();
  return stored.map(deserializeMeeting);
}

// Tasks
export async function getAllTasks(): Promise<Task[]> {
  await dbReady;
  const stored = await db.tasks.orderBy('createdAt').reverse().toArray();
  return stored.map(deserializeTask);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  await dbReady;
  const stored = await db.tasks.get(id);
  return stored ? deserializeTask(stored) : undefined;
}

export async function getTasksByMeetingId(meetingId: string): Promise<Task[]> {
  await dbReady;
  const stored = await db.tasks.where('meetingId').equals(meetingId).toArray();
  return stored.map(deserializeTask);
}

export async function getTasksByAssignee(assigneeId: string): Promise<Task[]> {
  await dbReady;
  const stored = await db.tasks.where('assigneeId').equals(assigneeId).toArray();
  return stored.map(deserializeTask);
}

export async function getTasksByStatus(status: string): Promise<Task[]> {
  await dbReady;
  const stored = await db.tasks.where('status').equals(status).toArray();
  return stored.map(deserializeTask);
}

export async function saveTask(task: Task): Promise<void> {
  await dbReady;
  await db.tasks.put(serializeTask(task));
}

export async function deleteTask(id: string): Promise<void> {
  await dbReady;
  await db.tasks.delete(id);
}

// Speakers
export async function getAllSpeakers(): Promise<SpeakerProfile[]> {
  await dbReady;
  const stored = await db.speakers.orderBy('name').toArray();
  return stored.map(deserializeSpeaker);
}

export async function getSpeakerById(id: string): Promise<SpeakerProfile | undefined> {
  await dbReady;
  const stored = await db.speakers.get(id);
  return stored ? deserializeSpeaker(stored) : undefined;
}

export async function saveSpeaker(speaker: SpeakerProfile): Promise<void> {
  await dbReady;
  await db.speakers.put(serializeSpeaker(speaker));
}

export async function deleteSpeaker(id: string): Promise<void> {
  await dbReady;
  await db.speakers.delete(id);
}

// Bulk operations
export async function saveTasks(tasks: Task[]): Promise<void> {
  await dbReady;
  await db.tasks.bulkPut(tasks.map(serializeTask));
}

export async function saveSpeakers(speakers: SpeakerProfile[]): Promise<void> {
  await dbReady;
  await db.speakers.bulkPut(speakers.map(serializeSpeaker));
}

// Statistics
export async function getMeetingStats() {
  const meetings = await getAllMeetings();
  const tasks = await getAllTasks();

  const completedMeetings = meetings.filter(m => m.status === 'completed');
  const totalDuration = completedMeetings.reduce((sum, m) => {
    if (m.startedAt && m.endedAt) {
      return sum + (m.endedAt.getTime() - m.startedAt.getTime());
    }
    return sum;
  }, 0);

  return {
    totalMeetings: meetings.length,
    completedMeetings: completedMeetings.length,
    totalDuration,
    averageDuration: completedMeetings.length > 0 ? totalDuration / completedMeetings.length : 0,
    tasksCreated: tasks.length,
    tasksCompleted: tasks.filter(t => t.status === 'completed').length,
  };
}

export async function getTaskStats() {
  const tasks = await getAllTasks();
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

// Clear all data (for testing/reset)
export async function clearAllData(): Promise<void> {
  await dbReady;
  await db.transaction('rw', [db.meetings, db.tasks, db.speakers, db.recordings], async () => {
    await db.meetings.clear();
    await db.tasks.clear();
    await db.speakers.clear();
    await db.recordings.clear();
  });
}

// Recordings (all operations wait for database to be ready)
export async function getRecordingsByMeetingId(meetingId: string): Promise<(MeetingRecording & { meetingId: string })[]> {
  await dbReady;
  const stored = await db.recordings.where('meetingId').equals(meetingId).toArray();

  // Debug logging: Raw recordings from DB
  console.log('Raw recordings from DB:', {
    meetingId,
    count: stored.length,
    recordings: stored.map(r => ({
      id: r.id,
      hasAudioData: !!r.audioData,
      audioDataSize: r.audioData?.byteLength,
      hasBlobLegacy: !!r.blob,
    })),
  });

  const recordings = await Promise.all(
    stored.map(async (record) => {
      try {
        // Migration: Convert old blob format to new audioData format
        if (record.blob && !record.audioData) {
          // Prevent race condition: skip if already being migrated
          if (migratingRecordings.has(record.id)) {
            console.log('Recording migration already in progress, skipping:', record.id);
            return null;
          }

          migratingRecordings.add(record.id);
          console.log('Migrating recording from blob to audioData format:', record.id);
          try {
            const audioData = await record.blob.arrayBuffer();
            await db.recordings.update(record.id, {
              audioData,
              blob: undefined
            });
            record.audioData = audioData;
            record.blob = undefined;
            console.log('Recording migrated successfully:', record.id);
          } catch (err) {
            console.error('Failed to migrate recording:', record.id, err);
            return null;
          } finally {
            migratingRecordings.delete(record.id);
          }
        }

        // Skip recordings without audioData (couldn't be migrated)
        if (!record.audioData) {
          console.warn('Skipping recording without audioData:', record.id);
          return null;
        }

        const recording = await deserializeRecording(record);

        if (!recording.blob || recording.blob.size === 0) {
          console.warn('Skipping recording with invalid blob:', recording.id);
          return null;
        }

        // Check if browser can play this format
        const audio = document.createElement('audio');
        const mimeType = recording.mimeType || recording.blob.type;
        const canPlay = audio.canPlayType(mimeType) !== '';

        if (!canPlay) {
          try {
            console.log('Converting old recording for Safari playback:', recording.id);
            const converted = await convertToPlayableFormat(recording.blob);

            // Update in-memory recording
            recording.blob = converted.blob;
            recording.mimeType = converted.mimeType;

            // Persist converted version to IndexedDB (with new audioData format)
            const newAudioData = await converted.blob.arrayBuffer();
            await db.recordings.update(record.id, {
              audioData: newAudioData,
              mimeType: converted.mimeType,
            });

            console.log('Recording converted and saved:', recording.id);
          } catch (err) {
            console.error('Failed to convert recording:', recording.id, err);
            // Return original even if conversion fails (user can delete)
          }
        }

        return recording;
      } catch (err) {
        console.error('Failed to process recording:', record.id, err);
        return null;
      }
    })
  );

  const validRecordings = recordings.filter((r): r is (MeetingRecording & { meetingId: string }) => r !== null);

  console.log('Recording loading complete:', {
    meetingId,
    total: stored.length,
    valid: validRecordings.length,
    filtered: stored.length - validRecordings.length,
  });

  return validRecordings;
}

export async function getRecordingById(id: string): Promise<(MeetingRecording & { meetingId: string }) | undefined> {
  await dbReady;
  const stored = await db.recordings.get(id);
  if (!stored) return undefined;

  // Migration: Convert old blob format to new audioData format
  if (stored.blob && !stored.audioData) {
    console.log('Migrating recording from blob to audioData format:', stored.id);
    try {
      const audioData = await stored.blob.arrayBuffer();
      await db.recordings.update(stored.id, {
        audioData,
        blob: undefined
      });
      stored.audioData = audioData;
      stored.blob = undefined;
      console.log('Recording migrated successfully:', stored.id);
    } catch (err) {
      console.error('Failed to migrate recording:', stored.id, err);
      return undefined;
    }
  }

  if (!stored.audioData) {
    console.warn('Recording without audioData:', stored.id);
    return undefined;
  }

  return await deserializeRecording(stored);
}

export async function saveRecording(recording: MeetingRecording, meetingId: string): Promise<void> {
  await dbReady;

  // Validate blob before saving
  if (!recording.blob || recording.blob.size === 0) {
    console.error('Cannot save recording: invalid or empty blob');
    throw new Error('Invalid recording blob');
  }

  console.log('Saving recording:', {
    id: recording.id,
    blobSize: recording.blob.size,
    blobType: recording.blob.type,
    mimeType: recording.mimeType,
  });

  const serialized = await serializeRecording(recording, meetingId);
  await db.recordings.put(serialized);
}

export async function deleteRecording(id: string): Promise<void> {
  await dbReady;
  await db.recordings.delete(id);
}

export async function deleteRecordingsByMeetingId(meetingId: string): Promise<void> {
  await dbReady;
  await db.recordings.where('meetingId').equals(meetingId).delete();
}

export default db;
