// Fix 17: Centralized labels and constants for Aurora Voice

export const DATE_GROUP_LABELS = {
  today: 'Heute',
  yesterday: 'Gestern',
  thisWeek: 'Diese Woche',
  older: 'Älter',
} as const;

export const MEETING_STATUS_LABELS = {
  scheduled: 'Geplant',
  'in-progress': 'Läuft',
  completed: 'Abgeschlossen',
  cancelled: 'Abgesagt',
} as const;

export const TASK_STATUS_LABELS = {
  pending: 'Ausstehend',
  'in-progress': 'In Bearbeitung',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
} as const;

export const TASK_PRIORITY_LABELS = {
  urgent: 'Dringend',
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
} as const;

export const ERROR_MESSAGES = {
  meetingNotFound: 'Meeting nicht gefunden',
  meetingCreateFailed: 'Fehler beim Erstellen des Meetings',
  meetingDeleteFailed: 'Fehler beim Löschen des Meetings',
  meetingRenameFailed: 'Fehler beim Umbenennen des Meetings',
  transcriptionFailed: 'Transkription fehlgeschlagen',
  enrichmentFailed: 'Anreicherung fehlgeschlagen',
  enrichmentTimeout: 'Anreicherung hat zu lange gedauert',
  copyFailed: 'Kopieren in die Zwischenablage fehlgeschlagen',
  noContentToCopy: 'Kein Inhalt zum Kopieren vorhanden',
  noContentToDownload: 'Kein Inhalt zum Herunterladen vorhanden',
} as const;

export const UI_LABELS = {
  newMeeting: 'Neues Meeting',
  noMeetings: 'Keine Meetings',
  startFirstMeeting: 'Starte dein erstes Meeting!',
  loading: 'Lade...',
  creating: 'Erstelle...',
  voiceMode: 'Voice Mode',
  delete: 'Löschen',
  rename: 'Umbenennen',
  cancel: 'Abbrechen',
  confirm: 'Bestätigen',
  copy: 'Kopieren',
  copied: 'Kopiert',
  export: 'Export',
  download: 'Download',
} as const;
