'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  ListChecks,
  MessageCircleQuestion,
  History,
  Sparkles,
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  FileCode2,
  RefreshCw,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '@/lib/store/settings';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useProjectStore, useProjectContext } from '@/lib/store/project-store';
import { GlassCard } from '@/components/ui/glass-card';
import {
  getMeetingPrepSummary,
  generateAgendaSuggestions,
  calculateEstimatedDuration,
  type PrepSummary,
} from '@/lib/meetings/prep';
import type { Meeting, AgendaItem } from '@/types/meeting';
import type { Task } from '@/types/task';

// Task preview card
function TaskCard({ task }: { task: Task }) {
  const priorityColors = {
    urgent: 'bg-error/10 text-error',
    high: 'bg-warning/10 text-warning',
    medium: 'bg-primary/10 text-primary',
    low: 'bg-foreground/10 text-foreground-secondary',
  };

  return (
    <div className="flex items-start gap-2 rounded-[var(--radius)] bg-foreground/5 p-2">
      <div className={`rounded px-1.5 py-0.5 text-xs font-medium ${priorityColors[task.priority]}`}>
        {task.priority}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{task.title}</p>
        {task.assigneeName && (
          <p className="text-xs text-foreground-secondary">@{task.assigneeName}</p>
        )}
      </div>
    </div>
  );
}

// Agenda item editor
function AgendaItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: AgendaItem;
  onUpdate: (updates: Partial<AgendaItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 group">
      <input
        type="text"
        value={item.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Agenda-Punkt..."
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none"
      />
      <select
        value={item.duration || 10}
        onChange={(e) => onUpdate({ duration: parseInt(e.target.value) })}
        className="w-16 rounded bg-foreground/5 px-1 py-0.5 text-xs text-foreground-secondary focus:outline-none"
      >
        <option value={5}>5 min</option>
        <option value={10}>10 min</option>
        <option value={15}>15 min</option>
        <option value={20}>20 min</option>
        <option value={30}>30 min</option>
        <option value={45}>45 min</option>
        <option value={60}>60 min</option>
      </select>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-error/60 hover:text-error transition-opacity"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// Inner component that uses useSearchParams
function PrepContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = searchParams.get('id');

  const { settings } = useAppStore();
  const {
    currentMeeting,
    setCurrentMeeting,
    updateMeeting,
    addAgendaItem,
    updateAgendaItem,
    removeAgendaItem,
  } = useMeetingStore();

  // Project store
  const {
    getOrIndexProject,
    reindexProject,
    clearProjectFromCache,
    isProjectIndexing,
    getIndexingProgress,
    getIndexingError,
    getCachedProject,
  } = useProjectStore();

  const [prepSummary, setPrepSummary] = useState<PrepSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAgenda, setIsGeneratingAgenda] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<string>('');

  // Get project context for current meeting
  const projectPath = currentMeeting?.projectPath;
  const isIndexing = projectPath ? isProjectIndexing(projectPath) : false;
  const indexProgress = projectPath ? getIndexingProgress(projectPath) : 0;
  const indexError = projectPath ? getIndexingError(projectPath) : null;
  const projectContext = projectPath ? getCachedProject(projectPath) : null;

  // Redirect if no meeting ID
  useEffect(() => {
    if (!meetingId) {
      router.push('/meeting');
    }
  }, [meetingId, router]);

  // Load meeting and prep data
  useEffect(() => {
    async function loadData() {
      if (!meetingId) return;

      try {
        setIsLoading(true);
        await setCurrentMeeting(meetingId);

        // Get prep summary
        const meeting = await useMeetingStore.getState().getMeeting(meetingId);
        if (meeting) {
          const summary = await getMeetingPrepSummary(meeting);
          setPrepSummary(summary);

          // If meeting has a project path, ensure it's indexed
          if (meeting.projectPath) {
            try {
              await getOrIndexProject(meeting.projectPath, (progress, phase) => {
                setIndexStatus(phase);
              });
              setIndexStatus('');
            } catch (err) {
              // Error is already stored in the project store
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load prep data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    return () => {
      setCurrentMeeting(null);
    };
  }, [meetingId, setCurrentMeeting, getOrIndexProject]);

  // Handle select project folder
  const handleSelectProjectFolder = useCallback(async () => {
    if (!meetingId) return;

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Export-Ordner auswählen',
      });

      if (selected && typeof selected === 'string') {
        // Update meeting with project path
        await updateMeeting(meetingId, { projectPath: selected });

        // Index the project
        setIndexStatus('Starte Indexierung...');
        try {
          await getOrIndexProject(selected, (progress, phase) => {
            setIndexStatus(phase);
          });
          setIndexStatus('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Indexierung fehlgeschlagen');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Öffnen des Dialogs');
    }
  }, [meetingId, updateMeeting, getOrIndexProject]);

  // Handle reindex project
  const handleReindexProject = useCallback(async () => {
    if (!meetingId || !projectPath) return;

    setIndexStatus('Starte Neuindexierung...');
    try {
      await reindexProject(projectPath, (progress, phase) => {
        setIndexStatus(phase);
      });
      setIndexStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neuindexierung fehlgeschlagen');
    }
  }, [meetingId, projectPath, reindexProject]);

  // Handle remove project
  const handleRemoveProject = useCallback(async () => {
    if (!meetingId || !projectPath) return;

    // Clear from cache
    clearProjectFromCache(projectPath);

    // Update meeting to remove project path
    await updateMeeting(meetingId, { projectPath: undefined });
    setIndexStatus('');
  }, [meetingId, projectPath, clearProjectFromCache, updateMeeting]);

  // Handle add agenda item
  const handleAddAgendaItem = useCallback(async () => {
    if (!meetingId) return;
    await addAgendaItem(meetingId, { title: '', duration: 10 });
  }, [meetingId, addAgendaItem]);

  // Handle update agenda item
  const handleUpdateAgendaItem = useCallback(
    async (itemId: string, updates: Partial<AgendaItem>) => {
      if (!meetingId) return;
      await updateAgendaItem(meetingId, itemId, updates);
    },
    [meetingId, updateAgendaItem]
  );

  // Handle remove agenda item
  const handleRemoveAgendaItem = useCallback(
    async (itemId: string) => {
      if (!meetingId) return;
      await removeAgendaItem(meetingId, itemId);
    },
    [meetingId, removeAgendaItem]
  );

  // Handle AI agenda generation
  const handleGenerateAgenda = useCallback(async () => {
    if (!currentMeeting || !prepSummary) return;

    try {
      setIsGeneratingAgenda(true);
      const suggestions = await generateAgendaSuggestions(
        currentMeeting,
        prepSummary.openTasks,
        prepSummary.openQuestions,
        settings
      );

      // Add suggestions as agenda items
      for (const suggestion of suggestions) {
        await addAgendaItem(meetingId!, suggestion);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate agenda');
    } finally {
      setIsGeneratingAgenda(false);
    }
  }, [currentMeeting, prepSummary, settings, meetingId, addAgendaItem]);

  // Handle start meeting
  const handleStartMeeting = useCallback(() => {
    if (!meetingId) return;
    router.push(`/meeting/live?id=${meetingId}`);
  }, [meetingId, router]);

  const estimatedDuration = currentMeeting
    ? calculateEstimatedDuration(currentMeeting.agenda)
    : 0;

  if (!meetingId) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-foreground-secondary">Lade Vorbereitung...</p>
        </div>
      </div>
    );
  }

  if (!currentMeeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-foreground-secondary">Meeting nicht gefunden</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="titlebar-drag-region sticky top-0 z-40 flex h-14 items-center justify-between border-b border-foreground/5 bg-background/80 px-4 backdrop-blur-xl">
        <div className="titlebar-no-drag flex items-center gap-3">
          <button
            onClick={() => router.push('/meeting')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-medium text-foreground">{currentMeeting.title}</h1>
            <p className="text-xs text-foreground-secondary">Vorbereitung</p>
          </div>
        </div>

        <div className="titlebar-no-drag flex items-center gap-2">
          {estimatedDuration > 0 && (
            <span className="flex items-center gap-1 text-xs text-foreground-secondary">
              <Clock className="h-3.5 w-3.5" />
              ~{estimatedDuration} min
            </span>
          )}
          <button
            onClick={handleStartMeeting}
            className="flex items-center gap-1.5 rounded-full bg-success px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-success/90"
          >
            Meeting starten
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-8">
        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] bg-error/10 p-4 text-error"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-error/60 hover:text-error">
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Project Context Section */}
          <div className="lg:col-span-2">
            <GlassCard>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                  <FileCode2 className="h-4 w-4" />
                  Export-Ordner
                </h2>
              </div>

              <p className="text-xs text-foreground-secondary/70 mb-4">
                Wähle einen Ordner, um Meeting-Daten als Markdown zu exportieren.
              </p>

              {projectPath ? (
                <div className="space-y-3">
                  {/* Current Project Info */}
                  <div className="rounded-[var(--radius-md)] bg-background-secondary p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-emerald-500/10">
                        <FileCode2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {projectContext?.name || projectPath.split('/').pop()}
                        </p>
                        <p className="text-xs text-foreground-secondary truncate">
                          {projectPath}
                        </p>
                        {projectContext && (
                          <p className="mt-1 text-xs text-emerald-500">
                            {projectContext.totalFiles} Dateien indexiert
                          </p>
                        )}
                        {isIndexing && (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 text-xs text-primary">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              {indexStatus || `${indexProgress} Dateien...`}
                            </div>
                          </div>
                        )}
                        {indexError && (
                          <p className="mt-1 text-xs text-error">{indexError}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleReindexProject}
                      disabled={isIndexing}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-background-secondary px-3 py-2 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isIndexing ? 'animate-spin' : ''}`} />
                      Neu indexieren
                    </button>
                    <button
                      onClick={handleSelectProjectFolder}
                      disabled={isIndexing}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-background-secondary px-3 py-2 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10 disabled:opacity-50"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Ändern
                    </button>
                    <button
                      onClick={handleRemoveProject}
                      disabled={isIndexing}
                      className="flex items-center justify-center rounded-[var(--radius-md)] bg-background-secondary px-3 py-2 text-xs text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSelectProjectFolder}
                  disabled={isIndexing}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-foreground/10 bg-background-secondary/50 px-4 py-6 text-sm text-foreground-secondary transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5 disabled:opacity-50"
                >
                  <FolderOpen className="h-5 w-5" />
                  Export-Ordner wählen
                </button>
              )}
            </GlassCard>
          </div>

          {/* Agenda Section */}
          <div className="lg:col-span-2">
            <GlassCard>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                  <ListChecks className="h-4 w-4" />
                  Agenda
                </h2>
                <div className="flex items-center gap-2">
                  {settings.openaiApiKey && (
                    <button
                      onClick={handleGenerateAgenda}
                      disabled={isGeneratingAgenda}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                      {isGeneratingAgenda ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      AI Vorschläge
                    </button>
                  )}
                  <button
                    onClick={handleAddAgendaItem}
                    className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10"
                  >
                    <Plus className="h-3 w-3" />
                    Hinzufügen
                  </button>
                </div>
              </div>

              {currentMeeting.agenda.length === 0 ? (
                <p className="py-4 text-center text-sm text-foreground-secondary">
                  Noch keine Agenda-Punkte. Klicke auf "Hinzufügen" oder nutze AI Vorschläge.
                </p>
              ) : (
                <div className="space-y-2">
                  {currentMeeting.agenda.map((item) => (
                    <AgendaItemRow
                      key={item.id}
                      item={item}
                      onUpdate={(updates) => handleUpdateAgendaItem(item.id, updates)}
                      onRemove={() => handleRemoveAgendaItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Open Tasks */}
          <GlassCard>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
              <CheckCircle2 className="h-4 w-4" />
              Offene Aufgaben ({prepSummary?.openTasks.length || 0})
            </h2>

            {prepSummary && prepSummary.openTasks.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {prepSummary.openTasks.slice(0, 10).map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {prepSummary.openTasks.length > 10 && (
                  <p className="text-xs text-foreground-secondary text-center pt-2">
                    +{prepSummary.openTasks.length - 10} weitere
                  </p>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-foreground-secondary">
                Keine offenen Aufgaben aus vorherigen Meetings
              </p>
            )}
          </GlassCard>

          {/* Open Questions */}
          <GlassCard>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
              <MessageCircleQuestion className="h-4 w-4" />
              Offene Fragen ({prepSummary?.openQuestions.length || 0})
            </h2>

            {prepSummary && prepSummary.openQuestions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {prepSummary.openQuestions.map((q, i) => (
                  <div key={i} className="rounded-[var(--radius)] bg-foreground/5 p-2">
                    <p className="text-sm text-foreground">{q.question}</p>
                    <p className="text-xs text-foreground-secondary mt-1">
                      aus: {q.meetingTitle}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-foreground-secondary">
                Keine offenen Fragen
              </p>
            )}
          </GlassCard>

          {/* Related Meetings */}
          {prepSummary && prepSummary.relatedMeetings.length > 0 && (
            <GlassCard className="lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                <History className="h-4 w-4" />
                Verwandte Meetings
              </h2>

              <div className="flex gap-2 overflow-x-auto pb-2">
                {prepSummary.relatedMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => router.push(`/meeting/summary?id=${meeting.id}`)}
                    className="flex-shrink-0 rounded-[var(--radius)] bg-foreground/5 px-3 py-2 text-left transition-colors hover:bg-foreground/10"
                  >
                    <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                    <p className="text-xs text-foreground-secondary">
                      {format(meeting.createdAt, 'dd.MM.yyyy', { locale: de })}
                    </p>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Discussion Checklist */}
          {prepSummary && prepSummary.discussionChecklist.length > 0 && (
            <GlassCard className="lg:col-span-2">
              <h2 className="mb-4 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                Diskussions-Checkliste
              </h2>

              <div className="space-y-1">
                {prepSummary.discussionChecklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-1 text-xs px-1.5 py-0.5 rounded ${
                        item.type === 'task'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-warning/10 text-warning'
                      }`}
                    >
                      {item.type === 'task' ? 'Aufgabe' : 'Frage'}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{item.text}</p>
                      {item.source && (
                        <p className="text-xs text-foreground-secondary">{item.source}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </main>
    </div>
  );
}

// Main page with Suspense
export default function PrepPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-2 text-sm text-foreground-secondary">Lade...</p>
          </div>
        </div>
      }
    >
      <PrepContent />
    </Suspense>
  );
}
