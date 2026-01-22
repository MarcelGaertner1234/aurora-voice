// Migration: Project FS to IndexedDB Primary Storage
// This module handles one-time migration of meeting data from project folders to IndexedDB

import { dbReady, saveMeeting, getMeetingById, saveRecording, getAllMeetings } from '@/lib/db';
import type { Meeting, MeetingRecording } from '@/types/meeting';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/utils/logger';

const MIGRATION_KEY = 'aurora_indexeddb_primary_v1';

// Check if migration has already run
export function hasMigrated(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(MIGRATION_KEY) !== null;
}

// Mark migration as complete
function markMigrationComplete(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MIGRATION_KEY, Date.now().toString());
  }
}

// Get known project paths from localStorage (legacy storage)
function getKnownProjectPaths(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const stored = localStorage.getItem('aurora_known_project_paths');
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

// Clean up legacy localStorage entries after migration
function cleanupLegacyStorage(): void {
  if (typeof localStorage === 'undefined') return;
  // Remove known project paths - no longer needed
  localStorage.removeItem('aurora_known_project_paths');
}

// Migrate a single meeting from project storage to IndexedDB
async function migrateMeetingToIndexedDB(
  meeting: Meeting,
  projectPath: string
): Promise<boolean> {
  try {
    // Check if meeting already exists in IndexedDB
    const existing = await getMeetingById(meeting.id);

    if (existing) {
      // Merge: prefer newer data
      if (meeting.updatedAt > existing.updatedAt) {
        // Project version is newer, update IndexedDB
        // Keep projectPath as export path reference
        await saveMeeting({
          ...meeting,
          projectPath, // Keep for export functionality
        });
        logger.info(`Migration: Updated meeting ${meeting.id} from project ${projectPath}`);
      }
      // else: IndexedDB version is newer, keep it
    } else {
      // Meeting doesn't exist in IndexedDB, save it
      await saveMeeting({
        ...meeting,
        projectPath, // Keep for export functionality
      });
      logger.info(`Migration: Migrated meeting ${meeting.id} from project ${projectPath}`);
    }

    return true;
  } catch (err) {
    logger.error(`Migration: Failed to migrate meeting ${meeting.id}:`, err);
    return false;
  }
}

// Main migration function - runs once at app startup
export async function migrateProjectDataToIndexedDB(): Promise<void> {
  // Skip if already migrated
  if (hasMigrated()) {
    logger.debug('Migration: Already completed, skipping');
    return;
  }

  logger.info('Migration: Starting IndexedDB primary storage migration...');

  // Wait for IndexedDB to be ready
  await dbReady;

  // Get all known project paths
  const knownProjectPaths = getKnownProjectPaths();

  if (knownProjectPaths.length === 0) {
    logger.debug('Migration: No known project paths, marking complete');
    markMigrationComplete();
    return;
  }

  logger.info(`Migration: Found ${knownProjectPaths.length} known project paths`);

  // For each project path, try to read meetings from .aurora folder
  // We use dynamic import to avoid issues on non-Tauri environments
  let migratedCount = 0;
  let errorCount = 0;

  try {
    // Check if we're in Tauri environment
    const { createAuroraFS } = await import('./aurora-fs');
    const { exists } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');

    for (const projectPath of knownProjectPaths) {
      try {
        const auroraPath = await join(projectPath, 'aurora');

        if (!(await exists(auroraPath))) {
          logger.debug(`Migration: No .aurora folder in ${projectPath}, skipping`);
          continue;
        }

        const fs = createAuroraFS(projectPath);
        const meetings = await fs.listMeetings();

        logger.info(`Migration: Found ${meetings.length} meetings in ${projectPath}`);

        for (const meeting of meetings) {
          const success = await migrateMeetingToIndexedDB(meeting, projectPath);
          if (success) {
            migratedCount++;

            // Also try to migrate recordings from project folder to IndexedDB
            try {
              const recordingFiles = await fs.listRecordingFiles(meeting);
              for (const filename of recordingFiles) {
                const blob = await fs.loadRecordingFile(meeting, filename);
                if (blob) {
                  const recording: MeetingRecording = {
                    id: uuidv4(),
                    blob,
                    mimeType: blob.type,
                    duration: 0, // Unknown duration for migrated recordings
                    createdAt: new Date(),
                    transcriptSegmentIds: [],
                  };
                  await saveRecording(recording, meeting.id);
                  logger.debug(`Migration: Migrated recording ${filename} for meeting ${meeting.id}`);
                }
              }
            } catch (recordingErr) {
              logger.warn(`Migration: Could not migrate recordings for meeting ${meeting.id}:`, recordingErr);
              // Don't fail the whole migration for recording errors
            }
          } else {
            errorCount++;
          }
        }
      } catch (projectErr) {
        logger.error(`Migration: Failed to process project ${projectPath}:`, projectErr);
        errorCount++;
      }
    }
  } catch (err) {
    logger.warn('Migration: Not in Tauri environment or module load failed:', err);
    // In web-only mode, we can't read from file system
    // Just mark as complete since there's nothing to migrate
  }

  // Clean up legacy storage
  cleanupLegacyStorage();

  // Mark migration as complete
  markMigrationComplete();

  logger.info(`Migration: Complete. Migrated ${migratedCount} meetings, ${errorCount} errors`);
}

// Export for testing
export { getKnownProjectPaths, cleanupLegacyStorage };
