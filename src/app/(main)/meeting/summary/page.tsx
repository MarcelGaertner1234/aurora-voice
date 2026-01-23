'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArrowLeft,
  Download,
  Mail,
  Copy,
  Check,
  Sparkles,
  Clock,
  Users,
  CheckCircle2,
  MessageCircleQuestion,
  ListChecks,
  AlertCircle,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useTaskStore } from '@/lib/store/task-store';
import { useSpeakerStore } from '@/lib/store/speaker-store';
import { GlassCard } from '@/components/ui/glass-card';
import {
  processPostMeeting,
  generateFollowUpEmail,
  calculateMeetingMetrics,
  type PostMeetingResult,
  type MeetingMetrics,
} from '@/lib/meetings/post';
import {
  exportMeetingToMarkdown,
  exportForObsidian,
  generateMeetingFilename,
} from '@/lib/export/markdown';
import type { Task } from '@/types/task';

// Format duration
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Progress bar component
function ProcessingProgress({
  stage,
  progress,
}: {
  stage: string;
  progress: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground-secondary">{stage}</span>
        <span className="text-foreground">{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

// Metric card
function MetricCard({
  icon: Icon,
  label,
  value,
  subvalue,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subvalue?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] bg-foreground/5 p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="text-xs text-foreground-secondary">{label}</p>
        {subvalue && <p className="text-xs text-foreground-secondary">{subvalue}</p>}
      </div>
    </div>
  );
}

// Task item component
function TaskItem({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) {
  const isCompleted = task.status === 'completed';
  const priorityColors = {
    urgent: 'text-error',
    high: 'text-warning',
    medium: 'text-primary',
    low: 'text-foreground-secondary',
  };

  return (
    <div className="flex items-start gap-2 py-1.5">
      <button
        onClick={onToggle}
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted
            ? 'border-success bg-success text-white'
            : 'border-foreground/30 hover:border-primary'
        }`}
      >
        {isCompleted && <Check className="h-3 w-3" />}
      </button>
      <div className="flex-1">
        <p className={`text-sm ${isCompleted ? 'text-foreground-secondary line-through' : 'text-foreground'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.assigneeName && (
            <span className="text-xs text-foreground-secondary">@{task.assigneeName}</span>
          )}
          <span className={`text-xs ${priorityColors[task.priority]}`}>{task.priority}</span>
        </div>
      </div>
    </div>
  );
}

// Inner component
function SummaryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = searchParams.get('id');

  const { settings } = useAppStore();
  const { currentMeeting, setCurrentMeeting, setSummary } = useMeetingStore();
  const { loadTasksForMeeting, createTasks, completeTask, reopenTask } = useTaskStore();
  const { speakers, loadSpeakers } = useSpeakerStore();

  const [meetingTasks, setMeetingTasks] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<MeetingMetrics | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    if (!meetingId) {
      router.push('/meeting');
      return;
    }

    async function loadData(id: string) {
      await setCurrentMeeting(id);
      await loadSpeakers();
      const tasks = await loadTasksForMeeting(id);
      setMeetingTasks(tasks);
    }

    loadData(meetingId);

    return () => {
      setCurrentMeeting(null);
    };
  }, [meetingId, router, setCurrentMeeting, loadSpeakers, loadTasksForMeeting]);

  // Calculate metrics when meeting loads
  useEffect(() => {
    if (currentMeeting) {
      const m = calculateMeetingMetrics(currentMeeting, meetingTasks);
      setMetrics(m);
    }
  }, [currentMeeting, meetingTasks]);

  // Handle full post-processing
  const handleProcessMeeting = useCallback(async () => {
    if (!currentMeeting || !meetingId) return;

    try {
      setIsProcessing(true);
      setError(null);

      const result = await processPostMeeting(
        currentMeeting,
        speakers,
        settings,
        (stage, progress) => {
          setProcessingStage(stage);
          setProcessingProgress(progress);
        }
      );

      // Save summary
      await setSummary(meetingId, result.summary);

      // Create tasks
      if (result.tasks.length > 0) {
        const createdTasks = await createTasks(
          result.tasks.map((t) => ({
            meetingId,
            title: t.title,
            assigneeName: t.assigneeName,
            priority: t.priority,
            sourceText: t.sourceText,
          })),
          currentMeeting // Pass meeting for auto-export
        );
        setMeetingTasks((prev) => [...prev, ...createdTasks]);
      }

      // Refresh meeting
      await setCurrentMeeting(meetingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
      setProcessingProgress(0);
    }
  }, [currentMeeting, meetingId, speakers, settings, setSummary, createTasks, setCurrentMeeting]);

  // Handle generate email
  const handleGenerateEmail = useCallback(async () => {
    if (!currentMeeting) return;

    try {
      setIsGeneratingEmail(true);
      const email = await generateFollowUpEmail(currentMeeting, meetingTasks, speakers, settings);
      setEmailDraft(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate email');
    } finally {
      setIsGeneratingEmail(false);
    }
  }, [currentMeeting, meetingTasks, speakers, settings]);

  // Handle task toggle
  const handleToggleTask = useCallback(
    async (taskId: string, status: string) => {
      try {
        if (status === 'completed') {
          await reopenTask(taskId);
        } else {
          await completeTask(taskId);
        }
        const tasks = await loadTasksForMeeting(meetingId!);
        setMeetingTasks(tasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update task');
      }
    },
    [meetingId, completeTask, reopenTask, loadTasksForMeeting]
  );

  // Handle download
  const handleDownload = useCallback(
    (format: 'markdown' | 'obsidian') => {
      if (!currentMeeting) return;

      const content =
        format === 'obsidian'
          ? exportForObsidian(currentMeeting, meetingTasks, speakers)
          : exportMeetingToMarkdown(currentMeeting, meetingTasks, speakers);

      const filename = generateMeetingFilename(currentMeeting);
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [currentMeeting, meetingTasks, speakers]
  );

  // Handle copy
  const handleCopy = useCallback(async () => {
    if (!currentMeeting) return;

    const content = exportMeetingToMarkdown(currentMeeting, meetingTasks, speakers);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentMeeting, meetingTasks, speakers]);

  if (!meetingId) return null;

  if (!currentMeeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-foreground-secondary">Lade Meeting...</p>
        </div>
      </div>
    );
  }

  const hasSummary = currentMeeting.summary;
  const hasTranscript = (currentMeeting.transcript?.segments &&
                        currentMeeting.transcript.segments.length > 0) ||
                       (currentMeeting.transcript?.fullText &&
                        currentMeeting.transcript.fullText.trim() !== '');

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
            <p className="text-xs text-foreground-secondary">
              {format(currentMeeting.createdAt, 'dd. MMM yyyy', { locale: de })}
            </p>
          </div>
        </div>

        <div className="titlebar-no-drag flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/10"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </button>
          <button
            onClick={() => handleDownload('markdown')}
            className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/10"
          >
            <Download className="h-4 w-4" />
            Export
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

        {/* Processing Progress */}
        {isProcessing && (
          <GlassCard className="mb-6">
            <ProcessingProgress stage={processingStage} progress={processingProgress} />
          </GlassCard>
        )}

        {/* No transcript warning */}
        {!hasTranscript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 rounded-[var(--radius-lg)] bg-warning/10 p-4 text-center text-sm text-warning"
          >
            Kein Transkript vorhanden. Die Zusammenfassung kann nicht generiert werden.
          </motion.div>
        )}

        {/* Generate Summary Button */}
        {!hasSummary && hasTranscript && !isProcessing && (
          <GlassCard className="mb-6">
            <div className="text-center py-4">
              <p className="text-foreground-secondary mb-4">
                Meeting-Zusammenfassung noch nicht erstellt
              </p>
              <button
                onClick={handleProcessMeeting}
                disabled={!settings.openaiApiKey}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-5 w-5" />
                Zusammenfassung generieren
              </button>
              {!settings.openaiApiKey && (
                <p className="mt-2 text-xs text-warning">API Key erforderlich</p>
              )}
            </div>
          </GlassCard>
        )}

        {/* Regenerate Summary Button */}
        {hasSummary && hasTranscript && !isProcessing && (
          <div className="flex justify-end mb-4">
            <button
              onClick={handleProcessMeeting}
              disabled={!settings.openaiApiKey || isProcessing}
              className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Summary neu generieren
            </button>
          </div>
        )}

        {/* Metrics */}
        {metrics && (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon={Clock}
              label="Dauer"
              value={formatDuration(metrics.totalDuration)}
            />
            <MetricCard
              icon={Users}
              label="Sprecher"
              value={metrics.speakingTimeByParticipant.size}
            />
            <MetricCard
              icon={CheckCircle2}
              label="Entscheidungen"
              value={metrics.decisionsCount}
            />
            <MetricCard
              icon={BarChart3}
              label="Engagement"
              value={`${metrics.engagementScore}%`}
            />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Summary */}
          <div className="lg:col-span-2 space-y-6">
            {hasSummary && (
              <>
                {/* Overview */}
                <GlassCard>
                  <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                    Überblick
                  </h2>
                  <p className="text-foreground">{currentMeeting.summary!.overview || 'Keine Zusammenfassung verfügbar.'}</p>
                </GlassCard>

                {/* Key Points */}
                {currentMeeting.summary!.keyPoints.length > 0 && (
                  <GlassCard>
                    <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                      Wichtige Punkte
                    </h2>
                    <ul className="space-y-2">
                      {currentMeeting.summary!.keyPoints.map((point, i) => (
                        <li key={`kp-${point.slice(0, 20).replace(/\s+/g, '-')}-${i}`} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                )}

                {/* Decisions */}
                {currentMeeting.summary!.decisions.length > 0 && (
                  <GlassCard>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                      <ListChecks className="h-4 w-4" />
                      Entscheidungen
                    </h2>
                    <div className="space-y-3">
                      {currentMeeting.summary!.decisions.map((d) => (
                        <div key={d.id} className="rounded-[var(--radius)] bg-success/5 p-3 border-l-2 border-success">
                          <p className="text-sm font-medium text-foreground">{d.text}</p>
                          {d.context && (
                            <p className="mt-1 text-xs text-foreground-secondary">{d.context}</p>
                          )}
                          {d.assigneeName && (
                            <p className="mt-1 text-xs text-foreground-secondary">@{d.assigneeName}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Open Questions */}
                {currentMeeting.summary!.openQuestions.length > 0 && (
                  <GlassCard>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                      <MessageCircleQuestion className="h-4 w-4" />
                      Offene Fragen
                    </h2>
                    <div className="space-y-2">
                      {currentMeeting.summary!.openQuestions.map((q) => (
                        <div key={q.id} className="flex items-start gap-2">
                          <span className={`mt-1 text-xs px-1.5 py-0.5 rounded ${q.answered ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                            {q.answered ? 'Beantwortet' : 'Offen'}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm text-foreground">{q.text}</p>
                            {q.assigneeName && (
                              <p className="mt-0.5 text-xs text-foreground-secondary">@{q.assigneeName}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tasks */}
            <GlassCard>
              <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                Aufgaben ({meetingTasks.length})
              </h2>

              {meetingTasks.length > 0 ? (
                <div className="divide-y divide-foreground/5 max-h-64 overflow-y-auto">
                  {meetingTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggleTask(task.id, task.status)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-foreground-secondary">
                  Keine Aufgaben
                </p>
              )}
            </GlassCard>

            {/* Follow-up Email */}
            {hasSummary && (
              <GlassCard>
                <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                  Follow-Up
                </h2>

                {emailDraft ? (
                  <div className="space-y-3">
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-foreground bg-foreground/5 p-2 rounded">
                      {emailDraft}
                    </pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(emailDraft)}
                      className="w-full rounded-[var(--radius)] bg-foreground/5 px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-foreground/10"
                    >
                      <Copy className="h-4 w-4 inline mr-1" />
                      E-Mail kopieren
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateEmail}
                    disabled={isGeneratingEmail || !settings.openaiApiKey}
                    className="w-full rounded-[var(--radius)] bg-foreground/5 px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-foreground/10 disabled:opacity-50"
                  >
                    {isGeneratingEmail ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border border-foreground-secondary border-t-transparent mr-1" />
                    ) : (
                      <Mail className="h-4 w-4 inline mr-1" />
                    )}
                    Follow-Up E-Mail erstellen
                  </button>
                )}
              </GlassCard>
            )}

            {/* Export Options */}
            <GlassCard variant="subtle">
              <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                Export
              </h2>
              <div className="space-y-2">
                <button
                  onClick={() => handleDownload('markdown')}
                  className="w-full rounded-[var(--radius)] bg-foreground/5 px-3 py-2 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/10"
                >
                  <Download className="h-4 w-4 inline mr-2" />
                  Markdown (.md)
                </button>
                <button
                  onClick={() => handleDownload('obsidian')}
                  className="w-full rounded-[var(--radius)] bg-foreground/5 px-3 py-2 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/10"
                >
                  <Download className="h-4 w-4 inline mr-2" />
                  Obsidian (mit Frontmatter)
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}

// Main page with Suspense
export default function SummaryPage() {
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
      <SummaryContent />
    </Suspense>
  );
}
