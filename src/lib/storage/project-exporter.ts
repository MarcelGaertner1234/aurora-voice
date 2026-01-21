// Project Exporter
// Export-only functions for writing meeting data to project folders (.aurora/)
// This replaces the old project-provider.ts - no read operations

import type { Meeting, MeetingRecording } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';
import { AuroraFileSystem, createAuroraFS } from './aurora-fs';
import {
  generateTranscriptMarkdown,
  generateSummaryMarkdown,
  generateTasksMarkdown,
} from '@/lib/export/file-exporter';

// Cache of file system instances by path
const fsCache = new Map<string, AuroraFileSystem>();

function getAuroraFS(projectPath: string): AuroraFileSystem {
  let fs = fsCache.get(projectPath);
  if (!fs) {
    fs = createAuroraFS(projectPath);
    fsCache.set(projectPath, fs);
  }
  return fs;
}

// Clear cache (useful for testing)
export function clearExporterCache(): void {
  fsCache.clear();
}

// ============================================
// Export Functions
// ============================================

/**
 * Export a complete meeting to the project folder
 * Creates/updates all files: meeting.json, transcript.md, summary.md, tasks.md
 */
export async function exportMeetingToProject(
  meeting: Meeting,
  tasks: Task[] = [],
  speakers: SpeakerProfile[] = []
): Promise<void> {
  if (!meeting.projectPath) {
    throw new Error('Meeting has no project path configured');
  }

  const fs = getAuroraFS(meeting.projectPath);

  // Ensure folder structure exists
  await fs.ensureAuroraFolder();
  await fs.ensureMeetingFolder(meeting);

  // Export meeting metadata
  await fs.saveMeetingMetadata(meeting);

  // Export transcript if present
  if (meeting.transcript?.segments && meeting.transcript.segments.length > 0) {
    const transcriptMd = generateTranscriptMarkdown(meeting, speakers);
    await fs.saveTranscriptMarkdown(meeting, transcriptMd);
  }

  // Export summary if present
  if (meeting.summary) {
    const summaryMd = generateSummaryMarkdown(meeting);
    await fs.saveSummaryMarkdown(meeting, summaryMd);
  }

  // Export tasks if present
  if (tasks.length > 0) {
    const tasksMd = generateTasksMarkdown(tasks, meeting.title);
    await fs.saveTasksMarkdown(meeting, tasksMd);
  }

  console.log(`Exported meeting ${meeting.id} to ${meeting.projectPath}`);
}

/**
 * Export a single recording to the project folder
 */
export async function exportRecordingToProject(
  meeting: Meeting,
  recording: MeetingRecording
): Promise<string> {
  if (!meeting.projectPath) {
    throw new Error('Meeting has no project path configured');
  }

  const fs = getAuroraFS(meeting.projectPath);

  // Ensure folder exists
  await fs.ensureMeetingFolder(meeting);

  // Save recording file
  const filename = await fs.saveRecordingFile(
    meeting,
    recording.id,
    recording.blob,
    recording.mimeType
  );

  console.log(`Exported recording ${recording.id} to ${meeting.projectPath}/${filename}`);
  return filename;
}

/**
 * Export tasks to the project folder
 */
export async function exportTasksToProject(
  meeting: Meeting,
  tasks: Task[]
): Promise<void> {
  if (!meeting.projectPath) {
    throw new Error('Meeting has no project path configured');
  }

  const fs = getAuroraFS(meeting.projectPath);

  // Ensure folder exists
  await fs.ensureMeetingFolder(meeting);

  // Generate and save tasks markdown
  const tasksMd = generateTasksMarkdown(tasks, meeting.title);
  await fs.saveTasksMarkdown(meeting, tasksMd);

  // Also update the global tasks.json in .aurora/tasks/
  const existingTasks = await fs.readTasks();
  const taskMap = new Map(existingTasks.map(t => [t.id, t]));

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  await fs.writeTasks(Array.from(taskMap.values()));

  console.log(`Exported ${tasks.length} tasks to ${meeting.projectPath}`);
}

/**
 * Export transcript markdown to project folder
 */
export async function exportTranscriptToProject(
  meeting: Meeting,
  speakers: SpeakerProfile[] = []
): Promise<void> {
  if (!meeting.projectPath) {
    throw new Error('Meeting has no project path configured');
  }

  if (!meeting.transcript?.segments || meeting.transcript.segments.length === 0) {
    console.warn('No transcript to export');
    return;
  }

  const fs = getAuroraFS(meeting.projectPath);
  await fs.ensureMeetingFolder(meeting);

  const transcriptMd = generateTranscriptMarkdown(meeting, speakers);
  await fs.saveTranscriptMarkdown(meeting, transcriptMd);

  console.log(`Exported transcript to ${meeting.projectPath}`);
}

/**
 * Export summary markdown to project folder
 */
export async function exportSummaryToProject(meeting: Meeting): Promise<void> {
  if (!meeting.projectPath) {
    throw new Error('Meeting has no project path configured');
  }

  if (!meeting.summary) {
    console.warn('No summary to export');
    return;
  }

  const fs = getAuroraFS(meeting.projectPath);
  await fs.ensureMeetingFolder(meeting);

  const summaryMd = generateSummaryMarkdown(meeting);
  await fs.saveSummaryMarkdown(meeting, summaryMd);

  console.log(`Exported summary to ${meeting.projectPath}`);
}

/**
 * Initialize .aurora folder structure in a project
 */
export async function initializeExportFolder(
  projectPath: string,
  projectName?: string
): Promise<void> {
  const fs = getAuroraFS(projectPath);
  await fs.ensureAuroraFolder();
  await fs.initializeConfig(projectName || projectPath.split('/').pop() || 'Project');

  console.log(`Initialized export folder at ${projectPath}`);
}

/**
 * Check if .aurora folder exists in project
 */
export async function hasExportFolder(projectPath: string): Promise<boolean> {
  const fs = getAuroraFS(projectPath);
  return fs.hasAuroraFolder();
}

/**
 * Get the underlying AuroraFileSystem for advanced operations
 */
export function getProjectFileSystem(projectPath: string): AuroraFileSystem {
  return getAuroraFS(projectPath);
}

// Legacy compatibility aliases (deprecated - will be removed)
/** @deprecated Use getProjectFileSystem instead */
export const getProjectStorageProvider = (projectPath: string) => ({
  getFileSystem: () => getAuroraFS(projectPath),
  hasAuroraFolder: () => hasExportFolder(projectPath),
  initializeAuroraFolder: (name: string) => initializeExportFolder(projectPath, name),
  isAnalysisStale: async (maxAgeHours = 1) => {
    const fs = getAuroraFS(projectPath);
    return fs.isAnalysisStale(maxAgeHours);
  },
});
