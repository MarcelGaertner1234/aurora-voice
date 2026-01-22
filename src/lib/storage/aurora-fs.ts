// Aurora File System Layer
// Handles file operations for local project storage in .aurora/ folder

import {
  readDir,
  readFile,
  readTextFile,
  writeFile,
  writeTextFile,
  exists,
  mkdir,
  remove,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';
import type {
  ProjectContext,
  ProjectAnalysis,
  AuroraProjectConfig,
  MeetingIndexEntry,
  ProjectContextIndex,
} from '@/types/project';
import { logger } from '@/lib/utils/logger';

// Constants
const AURORA_FOLDER = 'aurora';
const CONFIG_FILE = 'config.json';
const MEETINGS_FOLDER = 'meetings';
const MEETINGS_INDEX = 'index.json';
const TASKS_FOLDER = 'tasks';
const TASKS_FILE = 'tasks.json';
const CONTEXT_FOLDER = 'context';
const CONTEXT_INDEX = 'index.json';
const CONTEXT_ANALYSIS = 'analysis.json';
const CONFIG_VERSION = '1.0';
const FILE_READ_TIMEOUT_MS = 5000; // 5 Sekunden Timeout für Dateioperationen (Cloud-Ordner)

// Timeout-Wrapper für Dateioperationen (verhindert Blockierung bei Cloud-synchronisierten Ordnern)
async function readTextFileWithTimeout(path: string, timeoutMs = FILE_READ_TIMEOUT_MS): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`File read timeout after ${timeoutMs}ms: ${path}`)), timeoutMs);
  });

  return Promise.race([readTextFile(path), timeoutPromise]);
}

// Date serialization helpers (consistent with db/index.ts)
function serializeDate(date: Date): string {
  return date.toISOString();
}

function deserializeDate(dateStr: string): Date {
  return new Date(dateStr);
}

// Generate meeting folder name from date and slugified title
function generateMeetingFolderName(meeting: Meeting): string {
  const date = meeting.createdAt.toISOString().split('T')[0];
  const slug = meeting.title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${date}-${slug || meeting.id.slice(0, 8)}`;
}

// Legacy: Generate meeting filename (for backwards compatibility)
function generateMeetingFilename(meeting: Meeting): string {
  return `${generateMeetingFolderName(meeting)}.json`;
}

// Get file extension from MIME type
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/webm': 'webm',
  };
  return mimeToExt[mimeType] || 'webm';
}

// Serialize meeting for JSON storage
function serializeMeetingForFile(meeting: Meeting): Record<string, unknown> {
  return {
    ...meeting,
    scheduledAt: meeting.scheduledAt?.toISOString(),
    startedAt: meeting.startedAt?.toISOString(),
    endedAt: meeting.endedAt?.toISOString(),
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    summary: meeting.summary
      ? {
          ...meeting.summary,
          generatedAt: meeting.summary.generatedAt.toISOString(),
        }
      : undefined,
  };
}

// Deserialize meeting from JSON storage
function deserializeMeetingFromFile(data: Record<string, unknown>): Meeting {
  return {
    ...data,
    scheduledAt: data.scheduledAt ? deserializeDate(data.scheduledAt as string) : undefined,
    startedAt: data.startedAt ? deserializeDate(data.startedAt as string) : undefined,
    endedAt: data.endedAt ? deserializeDate(data.endedAt as string) : undefined,
    createdAt: deserializeDate(data.createdAt as string),
    updatedAt: deserializeDate(data.updatedAt as string),
    summary: data.summary
      ? {
          ...(data.summary as Record<string, unknown>),
          generatedAt: deserializeDate((data.summary as Record<string, unknown>).generatedAt as string),
        }
      : undefined,
  } as Meeting;
}

// Serialize task for JSON storage
function serializeTaskForFile(task: Task): Record<string, unknown> {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// Deserialize task from JSON storage
function deserializeTaskFromFile(data: Record<string, unknown>): Task {
  return {
    ...data,
    dueDate: data.dueDate ? deserializeDate(data.dueDate as string) : undefined,
    completedAt: data.completedAt ? deserializeDate(data.completedAt as string) : undefined,
    createdAt: deserializeDate(data.createdAt as string),
    updatedAt: deserializeDate(data.updatedAt as string),
  } as Task;
}

// Serialize config for JSON storage
function serializeConfigForFile(config: AuroraProjectConfig): Record<string, unknown> {
  return {
    ...config,
    linkedAt: config.linkedAt.toISOString(),
    lastSyncedAt: config.lastSyncedAt?.toISOString(),
  };
}

// Deserialize config from JSON storage
function deserializeConfigFromFile(data: Record<string, unknown>): AuroraProjectConfig {
  return {
    ...data,
    linkedAt: deserializeDate(data.linkedAt as string),
    lastSyncedAt: data.lastSyncedAt ? deserializeDate(data.lastSyncedAt as string) : undefined,
  } as AuroraProjectConfig;
}

// Serialize project analysis for JSON storage
function serializeAnalysisForFile(analysis: ProjectAnalysis): Record<string, unknown> {
  return {
    ...analysis,
    generatedAt: analysis.generatedAt.toISOString(),
  };
}

// Deserialize project analysis from JSON storage
function deserializeAnalysisFromFile(data: Record<string, unknown>): ProjectAnalysis {
  return {
    ...data,
    generatedAt: deserializeDate(data.generatedAt as string),
  } as ProjectAnalysis;
}

// Serialize context index for JSON storage
function serializeContextIndexForFile(index: ProjectContextIndex): Record<string, unknown> {
  return {
    ...index,
    lastIndexedAt: index.lastIndexedAt.toISOString(),
  };
}

// Deserialize context index from JSON storage
function deserializeContextIndexFromFile(data: Record<string, unknown>): ProjectContextIndex {
  return {
    ...data,
    lastIndexedAt: deserializeDate(data.lastIndexedAt as string),
  } as ProjectContextIndex;
}

// Serialize meeting index entry for JSON storage
function serializeMeetingIndexEntry(entry: MeetingIndexEntry): Record<string, unknown> {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// Deserialize meeting index entry from JSON storage
function deserializeMeetingIndexEntry(data: Record<string, unknown>): MeetingIndexEntry {
  return {
    ...data,
    createdAt: deserializeDate(data.createdAt as string),
    updatedAt: deserializeDate(data.updatedAt as string),
  } as MeetingIndexEntry;
}

export class AuroraFileSystem {
  private projectPath: string;
  private auroraPath: string | null = null;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  // Get the .aurora folder path
  private async getAuroraPath(): Promise<string> {
    if (!this.auroraPath) {
      this.auroraPath = await join(this.projectPath, AURORA_FOLDER);
    }
    return this.auroraPath;
  }

  // Ensure .aurora folder structure exists
  async ensureAuroraFolder(): Promise<void> {
    const auroraPath = await this.getAuroraPath();

    // Create main .aurora folder
    if (!(await exists(auroraPath))) {
      await mkdir(auroraPath, { recursive: true });
    }

    // Create subfolders
    const meetingsPath = await join(auroraPath, MEETINGS_FOLDER);
    if (!(await exists(meetingsPath))) {
      await mkdir(meetingsPath, { recursive: true });
    }

    const tasksPath = await join(auroraPath, TASKS_FOLDER);
    if (!(await exists(tasksPath))) {
      await mkdir(tasksPath, { recursive: true });
    }

    const contextPath = await join(auroraPath, CONTEXT_FOLDER);
    if (!(await exists(contextPath))) {
      await mkdir(contextPath, { recursive: true });
    }
  }

  // Check if .aurora folder exists
  async hasAuroraFolder(): Promise<boolean> {
    const auroraPath = await this.getAuroraPath();
    return exists(auroraPath);
  }

  // === Config Operations ===

  async readConfig(): Promise<AuroraProjectConfig | null> {
    try {
      const auroraPath = await this.getAuroraPath();
      const configPath = await join(auroraPath, CONFIG_FILE);

      if (!(await exists(configPath))) {
        return null;
      }

      const content = await readTextFileWithTimeout(configPath);
      const data = JSON.parse(content);
      return deserializeConfigFromFile(data);
    } catch (err) {
      logger.error('Failed to read aurora config (timeout or read error):', err);
      return null;
    }
  }

  async writeConfig(config: AuroraProjectConfig): Promise<void> {
    await this.ensureAuroraFolder();
    const auroraPath = await this.getAuroraPath();
    const configPath = await join(auroraPath, CONFIG_FILE);

    const serialized = serializeConfigForFile(config);
    await writeTextFile(configPath, JSON.stringify(serialized, null, 2));
  }

  async initializeConfig(projectName: string): Promise<AuroraProjectConfig> {
    const config: AuroraProjectConfig = {
      version: CONFIG_VERSION,
      projectName,
      linkedAt: new Date(),
      settings: {
        autoAnalyze: true,
        syncEnabled: false,
      },
    };
    await this.writeConfig(config);
    return config;
  }

  // === Meeting Operations ===

  async readMeetingIndex(): Promise<MeetingIndexEntry[]> {
    try {
      const auroraPath = await this.getAuroraPath();
      const indexPath = await join(auroraPath, MEETINGS_FOLDER, MEETINGS_INDEX);

      if (!(await exists(indexPath))) {
        return [];
      }

      const content = await readTextFileWithTimeout(indexPath);
      const data = JSON.parse(content);
      return (data.meetings || []).map(deserializeMeetingIndexEntry);
    } catch (err) {
      logger.error('Failed to read meeting index (timeout or read error):', err);
      return [];
    }
  }

  async writeMeetingIndex(entries: MeetingIndexEntry[]): Promise<void> {
    await this.ensureAuroraFolder();
    const auroraPath = await this.getAuroraPath();
    const indexPath = await join(auroraPath, MEETINGS_FOLDER, MEETINGS_INDEX);

    const serialized = {
      updatedAt: new Date().toISOString(),
      meetings: entries.map(serializeMeetingIndexEntry),
    };
    await writeTextFile(indexPath, JSON.stringify(serialized, null, 2));
  }

  async readMeeting(filename: string): Promise<Meeting | null> {
    try {
      const auroraPath = await this.getAuroraPath();
      const meetingPath = await join(auroraPath, MEETINGS_FOLDER, filename);

      if (!(await exists(meetingPath))) {
        return null;
      }

      const content = await readTextFileWithTimeout(meetingPath);
      const data = JSON.parse(content);
      return deserializeMeetingFromFile(data);
    } catch (err) {
      logger.error(`Failed to read meeting ${filename} (timeout or read error):`, err);
      return null;
    }
  }

  async readMeetingById(id: string): Promise<Meeting | null> {
    const index = await this.readMeetingIndex();
    const entry = index.find((e) => e.id === id);
    if (!entry) return null;
    return this.readMeeting(entry.filename);
  }

  async writeMeeting(meeting: Meeting): Promise<string> {
    await this.ensureAuroraFolder();
    const auroraPath = await this.getAuroraPath();

    // Generate folder name and filename
    const folderName = generateMeetingFolderName(meeting);
    const filename = `${folderName}.json`;
    const meetingPath = await join(auroraPath, MEETINGS_FOLDER, filename);

    // Write meeting file
    const serialized = serializeMeetingForFile(meeting);
    await writeTextFile(meetingPath, JSON.stringify(serialized, null, 2));

    // Update index
    const index = await this.readMeetingIndex();
    const existingIndex = index.findIndex((e) => e.id === meeting.id);

    // Preserve existing folderName if present (for existing meetings)
    const existingFolderName = existingIndex >= 0 ? index[existingIndex].folderName : undefined;

    const entry: MeetingIndexEntry = {
      id: meeting.id,
      filename,
      folderName: existingFolderName || folderName,  // Store folder name for future-proofing
      title: meeting.title,
      status: meeting.status,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };

    if (existingIndex >= 0) {
      // Check if filename changed (title changed)
      const oldFilename = index[existingIndex].filename;
      if (oldFilename !== filename) {
        // Delete old file
        const oldPath = await join(auroraPath, MEETINGS_FOLDER, oldFilename);
        if (await exists(oldPath)) {
          await remove(oldPath);
        }
      }
      index[existingIndex] = entry;
    } else {
      index.push(entry);
    }

    await this.writeMeetingIndex(index);
    return filename;
  }

  async deleteMeeting(id: string): Promise<boolean> {
    try {
      const auroraPath = await this.getAuroraPath();
      const index = await this.readMeetingIndex();
      const entry = index.find((e) => e.id === id);

      if (!entry) return false;

      // Delete meeting file
      const meetingPath = await join(auroraPath, MEETINGS_FOLDER, entry.filename);
      if (await exists(meetingPath)) {
        await remove(meetingPath);
      }

      // Update index
      const newIndex = index.filter((e) => e.id !== id);
      await this.writeMeetingIndex(newIndex);

      return true;
    } catch (err) {
      logger.error(`Failed to delete meeting ${id}:`, err);
      return false;
    }
  }

  async listMeetings(): Promise<Meeting[]> {
    const index = await this.readMeetingIndex();
    const meetings: Meeting[] = [];

    for (const entry of index) {
      const meeting = await this.readMeeting(entry.filename);
      if (meeting) {
        meetings.push(meeting);
      }
    }

    // Sort by creation date descending
    return meetings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // === Task Operations ===

  async readTasks(): Promise<Task[]> {
    try {
      const auroraPath = await this.getAuroraPath();
      const tasksPath = await join(auroraPath, TASKS_FOLDER, TASKS_FILE);

      if (!(await exists(tasksPath))) {
        return [];
      }

      const content = await readTextFileWithTimeout(tasksPath);
      const data = JSON.parse(content);
      return (data.tasks || []).map(deserializeTaskFromFile);
    } catch (err) {
      logger.error('Failed to read tasks (timeout or read error):', err);
      return [];
    }
  }

  async writeTasks(tasks: Task[]): Promise<void> {
    await this.ensureAuroraFolder();
    const auroraPath = await this.getAuroraPath();
    const tasksPath = await join(auroraPath, TASKS_FOLDER, TASKS_FILE);

    const serialized = {
      updatedAt: new Date().toISOString(),
      tasks: tasks.map(serializeTaskForFile),
    };
    await writeTextFile(tasksPath, JSON.stringify(serialized, null, 2));
  }

  async saveTask(task: Task): Promise<void> {
    const tasks = await this.readTasks();
    const existingIndex = tasks.findIndex((t) => t.id === task.id);

    if (existingIndex >= 0) {
      tasks[existingIndex] = task;
    } else {
      tasks.push(task);
    }

    await this.writeTasks(tasks);
  }

  async deleteTask(id: string): Promise<boolean> {
    const tasks = await this.readTasks();
    const newTasks = tasks.filter((t) => t.id !== id);

    if (newTasks.length === tasks.length) {
      return false; // Task not found
    }

    await this.writeTasks(newTasks);
    return true;
  }

  async getTasksByMeetingId(meetingId: string): Promise<Task[]> {
    const tasks = await this.readTasks();
    return tasks.filter((t) => t.meetingId === meetingId);
  }

  // === Context Operations ===

  async readContextIndex(): Promise<ProjectContextIndex | null> {
    try {
      const auroraPath = await this.getAuroraPath();
      const indexPath = await join(auroraPath, CONTEXT_FOLDER, CONTEXT_INDEX);

      if (!(await exists(indexPath))) {
        return null;
      }

      const content = await readTextFileWithTimeout(indexPath);
      const data = JSON.parse(content);
      return deserializeContextIndexFromFile(data);
    } catch (err) {
      logger.error('Failed to read context index (timeout or read error):', err);
      return null;
    }
  }

  async writeContextIndex(context: ProjectContext): Promise<void> {
    await this.ensureAuroraFolder();
    const auroraPath = await this.getAuroraPath();
    const indexPath = await join(auroraPath, CONTEXT_FOLDER, CONTEXT_INDEX);

    const index: ProjectContextIndex = {
      rootPath: context.rootPath,
      name: context.name,
      totalFiles: context.totalFiles,
      lastIndexedAt: context.indexedAt,
      fileTree: context.files.map((f) => f.path),
    };

    const serialized = serializeContextIndexForFile(index);
    await writeTextFile(indexPath, JSON.stringify(serialized, null, 2));
  }

  async readAnalysis(): Promise<ProjectAnalysis | null> {
    try {
      const auroraPath = await this.getAuroraPath();
      const analysisPath = await join(auroraPath, CONTEXT_FOLDER, CONTEXT_ANALYSIS);

      if (!(await exists(analysisPath))) {
        return null;
      }

      const content = await readTextFileWithTimeout(analysisPath);
      const data = JSON.parse(content);
      return deserializeAnalysisFromFile(data);
    } catch (err) {
      logger.error('Failed to read analysis (timeout or read error):', err);
      return null;
    }
  }

  async writeAnalysis(analysis: ProjectAnalysis): Promise<void> {
    await this.ensureAuroraFolder();
    const auroraPath = await this.getAuroraPath();
    const analysisPath = await join(auroraPath, CONTEXT_FOLDER, CONTEXT_ANALYSIS);

    const serialized = serializeAnalysisForFile(analysis);
    await writeTextFile(analysisPath, JSON.stringify(serialized, null, 2));
  }

  // Check if analysis is stale (older than specified hours)
  async isAnalysisStale(maxAgeHours = 1): Promise<boolean> {
    const analysis = await this.readAnalysis();
    if (!analysis) return true;

    const ageMs = Date.now() - analysis.generatedAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    return ageHours > maxAgeHours;
  }

  // === Meeting Folder Operations ===

  // Get the path to a meeting folder (uses stored folder name from index if available)
  async getMeetingFolderPath(meeting: Meeting): Promise<string> {
    const auroraPath = await this.getAuroraPath();
    // Try to use stored folder name from index first (survives name generation changes)
    const index = await this.readMeetingIndex();
    const entry = index.find((e) => e.id === meeting.id);
    const folderName = entry?.folderName || generateMeetingFolderName(meeting);
    return join(auroraPath, MEETINGS_FOLDER, folderName);
  }

  // Ensure meeting folder exists
  async ensureMeetingFolder(meeting: Meeting): Promise<string> {
    await this.ensureAuroraFolder();
    const folderPath = await this.getMeetingFolderPath(meeting);
    if (!(await exists(folderPath))) {
      await mkdir(folderPath, { recursive: true });
    }
    return folderPath;
  }

  // === Recording File Operations ===

  // Save a recording blob to a file in the meeting folder
  async saveRecordingFile(
    meeting: Meeting,
    recordingId: string,
    blob: Blob,
    mimeType: string
  ): Promise<string> {
    const folderPath = await this.ensureMeetingFolder(meeting);
    const extension = getExtensionFromMimeType(mimeType);

    // Count existing recordings to generate sequential filename
    const existingRecordings = await this.listRecordingFiles(meeting);
    const recordingNumber = existingRecordings.length + 1;
    const filename = `recording-${recordingNumber}.${extension}`;
    const filePath = await join(folderPath, filename);

    // Convert blob to Uint8Array
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    await writeFile(filePath, data);
    logger.debug('Recording file saved:', filePath);

    return filename;
  }

  // Load a recording file from the meeting folder
  async loadRecordingFile(
    meeting: Meeting,
    filename: string
  ): Promise<Blob | null> {
    try {
      const folderPath = await this.getMeetingFolderPath(meeting);
      const filePath = await join(folderPath, filename);

      if (!(await exists(filePath))) {
        return null;
      }

      const data = await readFile(filePath);

      // Determine MIME type from extension
      const ext = filename.split('.').pop()?.toLowerCase();
      const extToMime: Record<string, string> = {
        'webm': 'audio/webm',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
      };
      const mimeType = extToMime[ext || ''] || 'audio/webm';

      return new Blob([data], { type: mimeType });
    } catch (err) {
      logger.error(`Failed to load recording file ${filename}:`, err);
      return null;
    }
  }

  // Delete a recording file from the meeting folder
  async deleteRecordingFile(meeting: Meeting, filename: string): Promise<boolean> {
    try {
      const folderPath = await this.getMeetingFolderPath(meeting);
      const filePath = await join(folderPath, filename);

      if (await exists(filePath)) {
        await remove(filePath);
        return true;
      }
      return false;
    } catch (err) {
      logger.error(`Failed to delete recording file ${filename}:`, err);
      return false;
    }
  }

  // List all recording files in a meeting folder
  async listRecordingFiles(meeting: Meeting): Promise<string[]> {
    try {
      const folderPath = await this.getMeetingFolderPath(meeting);

      if (!(await exists(folderPath))) {
        return [];
      }

      const entries = await readDir(folderPath);
      const recordingFiles = entries
        .filter((entry) => {
          const name = entry.name || '';
          return name.startsWith('recording-') &&
            (name.endsWith('.webm') || name.endsWith('.ogg') ||
             name.endsWith('.m4a') || name.endsWith('.mp3') || name.endsWith('.wav'));
        })
        .map((entry) => entry.name || '')
        .filter((name) => name !== '')
        .sort(); // Sort to maintain order

      return recordingFiles;
    } catch (err) {
      logger.error('Failed to list recording files:', err);
      return [];
    }
  }

  // === Markdown Export Operations ===

  // Save transcript markdown to meeting folder
  async saveTranscriptMarkdown(meeting: Meeting, content: string): Promise<void> {
    const folderPath = await this.ensureMeetingFolder(meeting);
    const filePath = await join(folderPath, 'transcript.md');
    await writeTextFile(filePath, content);
  }

  // Save summary markdown to meeting folder
  async saveSummaryMarkdown(meeting: Meeting, content: string): Promise<void> {
    const folderPath = await this.ensureMeetingFolder(meeting);
    const filePath = await join(folderPath, 'summary.md');
    await writeTextFile(filePath, content);
  }

  // Save tasks markdown to meeting folder
  async saveTasksMarkdown(meeting: Meeting, content: string): Promise<void> {
    const folderPath = await this.ensureMeetingFolder(meeting);
    const filePath = await join(folderPath, 'tasks.md');
    await writeTextFile(filePath, content);
  }

  // Save meeting metadata JSON to meeting folder
  async saveMeetingMetadata(meeting: Meeting): Promise<void> {
    const folderPath = await this.ensureMeetingFolder(meeting);
    const filePath = await join(folderPath, 'meeting.json');
    const serialized = serializeMeetingForFile(meeting);
    await writeTextFile(filePath, JSON.stringify(serialized, null, 2));
  }

  // === Utility Methods ===

  getProjectPath(): string {
    return this.projectPath;
  }
}

// Factory function for creating AuroraFileSystem instances
export function createAuroraFS(projectPath: string): AuroraFileSystem {
  return new AuroraFileSystem(projectPath);
}
