// Data Export and Privacy Management for Aurora Voice
// GDPR-compliant data export and deletion

import { getAllMeetings, getAllTasks, getAllSpeakers, clearAllData } from '@/lib/db';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';
import { logger } from '@/lib/utils/logger';

export interface ExportedData {
  exportedAt: string;
  version: string;
  meetings: Meeting[];
  tasks: Task[];
  speakers: SpeakerProfile[];
  statistics: {
    totalMeetings: number;
    totalTasks: number;
    totalSpeakers: number;
    oldestMeeting: string | null;
    newestMeeting: string | null;
  };
}

export interface PrivacyStatus {
  provider: 'local' | 'cloud';
  providerName: string;
  dataLocation: string;
  apiCallsEnabled: boolean;
  description: string;
}

/**
 * Get current privacy status based on settings
 */
export function getPrivacyStatus(
  selectedProvider: 'openai' | 'anthropic' | 'ollama'
): PrivacyStatus {
  switch (selectedProvider) {
    case 'ollama':
      return {
        provider: 'local',
        providerName: 'Ollama (Lokal)',
        dataLocation: 'Alle Daten bleiben auf Ihrem Gerät',
        apiCallsEnabled: false,
        description: 'Vollständig offline. Keine Daten verlassen Ihren Computer.',
      };
    case 'openai':
      return {
        provider: 'cloud',
        providerName: 'OpenAI',
        dataLocation: 'Audio- und Textdaten werden an OpenAI gesendet',
        apiCallsEnabled: true,
        description: 'Transkription (Whisper) und Enrichment werden über OpenAI API verarbeitet.',
      };
    case 'anthropic':
      return {
        provider: 'cloud',
        providerName: 'Anthropic',
        dataLocation: 'Textdaten werden an Anthropic gesendet',
        apiCallsEnabled: true,
        description: 'Enrichment wird über Anthropic Claude API verarbeitet. Audio bleibt lokal.',
      };
    default:
      return {
        provider: 'cloud',
        providerName: 'Unbekannt',
        dataLocation: 'Datenverarbeitung unbekannt',
        apiCallsEnabled: true,
        description: 'Bitte konfigurieren Sie einen Provider in den Einstellungen.',
      };
  }
}

/**
 * Export all user data for GDPR compliance (Art. 20)
 */
export async function exportAllData(): Promise<ExportedData> {
  const [meetings, tasks, speakers] = await Promise.all([
    getAllMeetings(),
    getAllTasks(),
    getAllSpeakers(),
  ]);

  // Sort meetings by date
  const sortedMeetings = [...meetings].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const exportData: ExportedData = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    meetings,
    tasks,
    speakers,
    statistics: {
      totalMeetings: meetings.length,
      totalTasks: tasks.length,
      totalSpeakers: speakers.length,
      oldestMeeting: sortedMeetings.length > 0
        ? sortedMeetings[0].createdAt.toISOString()
        : null,
      newestMeeting: sortedMeetings.length > 0
        ? sortedMeetings[sortedMeetings.length - 1].createdAt.toISOString()
        : null,
    },
  };

  logger.info('Data export completed', exportData.statistics);

  return exportData;
}

/**
 * Download exported data as JSON file
 */
export function downloadExportedData(data: ExportedData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `aurora-voice-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  logger.info('Data export downloaded');
}

/**
 * Delete all user data for GDPR compliance (Art. 17)
 */
export async function deleteAllData(): Promise<void> {
  logger.warn('Initiating complete data deletion (GDPR Art. 17)');

  // Clear IndexedDB
  await clearAllData();

  // Clear localStorage
  if (typeof window !== 'undefined') {
    // Clear Aurora-specific localStorage items
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('aurora-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  logger.info('All data deleted successfully');
}

/**
 * Get data statistics for display
 */
export async function getDataStatistics(): Promise<{
  meetings: number;
  tasks: number;
  speakers: number;
  recordings: number;
  totalTranscriptWords: number;
  oldestDate: Date | null;
}> {
  const [meetings, tasks, speakers] = await Promise.all([
    getAllMeetings(),
    getAllTasks(),
    getAllSpeakers(),
  ]);

  let totalWords = 0;
  let recordingsCount = 0;

  meetings.forEach(m => {
    if (m.transcript?.fullText) {
      totalWords += m.transcript.fullText.split(/\s+/).filter(w => w.length > 0).length;
    }
    if (m.recordings) {
      recordingsCount += m.recordings.length;
    }
  });

  const sortedMeetings = [...meetings].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  return {
    meetings: meetings.length,
    tasks: tasks.length,
    speakers: speakers.length,
    recordings: recordingsCount,
    totalTranscriptWords: totalWords,
    oldestDate: sortedMeetings.length > 0 ? sortedMeetings[0].createdAt : null,
  };
}

/**
 * Data processing log entry
 */
export interface ProcessingLogEntry {
  id: string;
  timestamp: Date;
  action: 'transcription' | 'enrichment' | 'summary' | 'export';
  provider: string;
  dataSent: string;
  dataReceived: string;
  duration: number;
}

// In-memory log (not persisted for privacy)
let processingLog: ProcessingLogEntry[] = [];

/**
 * Add entry to processing log
 */
export function logProcessingEvent(entry: Omit<ProcessingLogEntry, 'id' | 'timestamp'>): void {
  const logEntry: ProcessingLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };

  // Keep only last 100 entries
  processingLog = [logEntry, ...processingLog.slice(0, 99)];
}

/**
 * Get processing log
 */
export function getProcessingLog(): ProcessingLogEntry[] {
  return processingLog;
}

/**
 * Clear processing log
 */
export function clearProcessingLog(): void {
  processingLog = [];
}
