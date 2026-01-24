'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArrowLeft,
  Play,
  Square,
  Mic,
  MicOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Sparkles,
  ListTodo,
  Users,
  HelpCircle,
  Volume2,
  Settings2,
  Search,
  ChevronDown,
  ChevronUp,
  FileCode2,
  ExternalLink,
  Pause,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useTaskStore } from '@/lib/store/task-store';
import { useSpeakerStore } from '@/lib/store/speaker-store';
import { useProjectStore } from '@/lib/store/project-store';
import { findMatchingFiles } from '@/lib/project/matcher';
import type { ProjectContext, ProjectMatch } from '@/types/project';
import { useLiveTranscript } from '@/hooks/use-live-transcript';
import { useLiveDiarization } from '@/hooks/use-live-diarization';
import { GlassCard } from '@/components/ui/glass-card';
import { SpeakerLabel } from '@/components/transcript/speaker-label';
import { SpeakerAssignment } from '@/components/speakers/speaker-assignment';
import {
  getElapsedTime,
  formatElapsedTime,
  formatAbsoluteTimestamp,
  startMeetingSession,
  endMeetingSession,
  extractAndCreateTasks,
  exportMeetingToMarkdown,
} from '@/lib/meetings/engine';
import { processPostMeeting } from '@/lib/meetings/post';
import {
  confirmSpeakerAssignment,
  rejectSpeakerSuggestion,
} from '@/lib/diarization';
import { KeywordHighlight, KeywordFilterBar, KeywordLegend } from '@/components/transcript/keyword-highlight';
import {
  DEFAULT_KEYWORD_CATEGORIES,
} from '@/lib/meetings/live';
import { ResearchPanel } from '@/components/research/research-panel';
import { useResearch } from '@/hooks/use-research';
import type { TranscriptSegment } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';

// Timer component
function LiveTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 font-mono text-lg text-foreground">
      <Clock className="h-5 w-5 text-primary" />
      {formatElapsedTime(elapsed)}
    </div>
  );
}

// Transcript segment component with speaker support and keyword highlighting
interface TranscriptSegmentViewProps {
  segment: TranscriptSegment;
  speakers: SpeakerProfile[];
  meetingStart: Date;
  onAssignSpeaker?: (segmentId: string, speakerId: string) => void;
  onRejectSuggestion?: (segmentId: string) => void;
  onCreateSpeaker?: (name: string) => Promise<SpeakerProfile>;
  showSpeakerControls?: boolean;
  showKeywords?: boolean;
  isLatest?: boolean;
}

function TranscriptSegmentView({
  segment,
  speakers,
  meetingStart,
  onAssignSpeaker,
  onRejectSuggestion,
  onCreateSpeaker,
  showSpeakerControls = false,
  showKeywords = true,
  isLatest = false,
}: TranscriptSegmentViewProps) {
  const timeStr = formatAbsoluteTimestamp(meetingStart, segment.startTime);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 py-2 ${isLatest ? 'bg-primary/5 -mx-2 px-2 rounded-lg' : ''}`}
    >
      <span className="flex-shrink-0 font-mono text-xs text-foreground-secondary">
        {timeStr}
      </span>
      <div className="flex-1">
        {/* Speaker label or assignment */}
        {showSpeakerControls && onAssignSpeaker && onRejectSuggestion && onCreateSpeaker ? (
          <div className="mb-1">
            <SpeakerAssignment
              segment={segment}
              speakers={speakers}
              onAssign={onAssignSpeaker}
              onReject={onRejectSuggestion}
              onCreateSpeaker={onCreateSpeaker}
            />
          </div>
        ) : (segment.speakerId || segment.suggestedSpeakerId) ? (
          <div className="mb-1">
            <SpeakerLabel
              speakerId={segment.speakerId}
              suggestedSpeakerId={segment.suggestedSpeakerId}
              speakers={speakers}
              confirmed={segment.confirmed}
            />
          </div>
        ) : null}
        {/* Text with keyword highlighting */}
        {showKeywords ? (
          <KeywordHighlight
            text={segment.text}
            categories={DEFAULT_KEYWORD_CATEGORIES}
            animate={isLatest}
            className={`text-sm text-foreground ${isLatest ? 'font-medium' : ''}`}
          />
        ) : (
          <p className={`text-sm text-foreground ${isLatest ? 'font-medium' : ''}`}>{segment.text}</p>
        )}
      </div>
    </motion.div>
  );
}

// Task item component
function TaskItem({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const isCompleted = task.status === 'completed';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-2 py-1.5"
    >
      <button
        onClick={onToggle}
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted
            ? 'border-success bg-success text-white'
            : 'border-foreground/30 hover:border-primary'
        }`}
      >
        {isCompleted && <CheckCircle2 className="h-3 w-3" />}
      </button>
      <div className="flex-1">
        <p className={`text-sm ${isCompleted ? 'text-foreground-secondary line-through' : 'text-foreground'}`}>
          {task.title}
        </p>
        {task.assigneeName && (
          <p className="text-xs text-foreground-secondary">@ {task.assigneeName}</p>
        )}
      </div>
    </motion.div>
  );
}

// Inner component that uses useSearchParams
function LiveMeetingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = searchParams.get('id');

  // Stores
  const { settings, addTranscriptionUsage, apiKeysLoaded } = useAppStore();
  const {
    currentMeeting,
    setCurrentMeeting,
    liveTranscript,
    addTranscriptSegment,
    updateTranscriptSegment,
    endMeeting,
    startMeeting,
    setRecording,
    addRecording,
    setSummary,
  } = useMeetingStore();
  const { loadTasksForMeeting, completeTask, reopenTask, createTask } = useTaskStore();
  const { speakers, loadSpeakers, createSpeaker } = useSpeakerStore();
  const { getOrIndexProject, getCachedProject } = useProjectStore();

  // Live Diarization (speaker detection) - must be defined before useLiveTranscript to use in callback
  const {
    processSegment: diarizeSegmentLive,
    isProcessing: isDiarizing,
  } = useLiveDiarization({
    speakers,
    meetingParticipantIds: currentMeeting?.participantIds,
    settings,
    enabled: settings.autoSpeakerDetection ?? true,
    confidenceThreshold: settings.speakerDetectionConfidenceThreshold ?? 0.6,
  });

  // Live Transcription
  const {
    isRecording: isRecorderActive,
    isPaused,
    isProcessing: isChunkProcessing,
    segments: liveSegments,
    pendingChunks,
    audioLevel: liveAudioLevel,
    isSpeaking,
    decisions: liveDetectedDecisions,
    questions: liveDetectedQuestions,
    error: transcriptError,
    start: startLiveTranscription,
    stop: stopLiveTranscription,
    pause: pauseTranscription,
    resume: resumeTranscription,
  } = useLiveTranscript({
    apiKey: settings.openaiApiKey,
    language: settings.language,
    chunkDuration: 5000,
    useSmartChunking: true,
    onSegment: async (segment) => {
      addTranscriptSegment(segment);
      addTranscriptionUsage((segment.endTime - segment.startTime) / 1000);

      // Auto speaker detection
      if (settings.autoSpeakerDetection ?? true) {
        const result = await diarizeSegmentLive(segment);
        if (result?.suggestedSpeakerId) {
          updateTranscriptSegment(segment.id, {
            suggestedSpeakerId: result.suggestedSpeakerId,
            confidence: result.confidence,
          });
        }
      }
    },
  });

  // Local state
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isExtractingTasks, setIsExtractingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetingTasks, setMeetingTasks] = useState<Task[]>([]);
  const [showSpeakerControls, setShowSpeakerControls] = useState(false);
  const [showKeywords, setShowKeywords] = useState(true);
  const [showResearch, setShowResearch] = useState(false);
  const [showProjectContext, setShowProjectContext] = useState(true);
  const [projectMatches, setProjectMatches] = useState<ProjectMatch[]>([]);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);

  // Sync transcript error to local error state
  useEffect(() => {
    if (transcriptError) {
      setError(transcriptError);
    }
  }, [transcriptError]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Research hook
  const {
    isSearching: isResearching,
    results: researchResults,
    suggestions: researchSuggestions,
    generateSuggestions,
  } = useResearch({ meetingId: meetingId || undefined });

  // Redirect if no meeting ID
  useEffect(() => {
    if (!meetingId) {
      router.push('/meeting');
    }
  }, [meetingId, router]);

  // Load meeting and speakers on mount
  useEffect(() => {
    async function loadMeetingData() {
      if (!meetingId) return;

      try {
        await setCurrentMeeting(meetingId);
        const tasks = await loadTasksForMeeting(meetingId);
        setMeetingTasks(tasks);
        await loadSpeakers();

        // Load project context if meeting has a project path
        const meeting = await useMeetingStore.getState().getMeeting(meetingId);
        if (meeting?.projectPath) {
          const context = await getOrIndexProject(meeting.projectPath);
          setProjectContext(context);
        }
      } catch (err) {
        console.error('Failed to load meeting data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load meeting data');
      }
    }

    loadMeetingData();

    return () => {
      setCurrentMeeting(null);
    };
  }, [meetingId, setCurrentMeeting, loadTasksForMeeting, loadSpeakers, getOrIndexProject]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript]);

  // Generate research suggestions when transcript updates
  useEffect(() => {
    if (liveTranscript.length > 0) {
      const fullText = liveTranscript.map(s => s.text).join(' ');
      generateSuggestions(fullText);
    }
  }, [liveTranscript, generateSuggestions]);

  // Update project matches when transcript changes
  useEffect(() => {
    if (projectContext && liveTranscript.length > 0) {
      const fullText = liveTranscript.map(s => s.text).join(' ');
      const matches = findMatchingFiles(fullText, projectContext, {
        minRelevance: 0.5,
        maxResults: 8,
      });
      setProjectMatches(matches);
    }
  }, [liveTranscript, projectContext]);

  // Handle start recording with live transcription
  const handleStartRecording = useCallback(async () => {
    if (!meetingId) return;

    // Check if API key is available
    if (!settings.openaiApiKey) {
      setError('OpenAI API-Key fehlt. Bitte in den Einstellungen hinterlegen.');
      return;
    }

    try {
      if (currentMeeting?.status === 'scheduled') {
        await startMeeting(meetingId);
        await startMeetingSession(meetingId);
      }
      setRecording(true);
      await startLiveTranscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  }, [currentMeeting, meetingId, startMeeting, setRecording, startLiveTranscription, settings.openaiApiKey]);

  // Handle stop recording - transcription already happened during recording
  const handleStopRecording = useCallback(async () => {
    try {
      await stopLiveTranscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
    }
  }, [stopLiveTranscription]);

  // Handle end meeting
  const handleEndMeeting = useCallback(async () => {
    if (!meetingId) return;
    try {
      await endMeetingSession();
      await endMeeting(meetingId);
      setRecording(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end meeting');
    }
  }, [meetingId, endMeeting, setRecording]);

  // Handle generate summary - using enhanced processPostMeeting
  const handleGenerateSummary = useCallback(async () => {
    if (!meetingId || !currentMeeting) return;
    try {
      setIsGeneratingSummary(true);

      // Use the new enhanced processPostMeeting function
      const { summary, tasks } = await processPostMeeting(
        currentMeeting,
        speakers,
        settings,
        (stage, progress) => {
          console.log(`[Post-Meeting] ${stage} (${Math.round(progress * 100)}%)`);
        },
        projectContext
      );

      // Save the summary to the meeting store
      await setSummary(meetingId, summary);

      // Create tasks from extracted tasks
      if (tasks.length > 0) {
        for (const task of tasks) {
          try {
            await createTask({
              title: task.title,
              meetingId,
              assigneeName: task.assigneeName,
              priority: task.priority || 'medium',
            });
          } catch (taskErr) {
            console.warn('[Meeting] Failed to create task:', taskErr);
          }
        }
        const updatedTasks = await loadTasksForMeeting(meetingId);
        setMeetingTasks(updatedTasks);
      }

      await setCurrentMeeting(meetingId); // Reload meeting with summary
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [meetingId, currentMeeting, speakers, settings, projectContext, setSummary, createTask, loadTasksForMeeting, setCurrentMeeting]);

  // Handle extract tasks
  const handleExtractTasks = useCallback(async () => {
    if (!meetingId) return;
    try {
      setIsExtractingTasks(true);
      await extractAndCreateTasks(meetingId, settings);
      const updatedTasks = await loadTasksForMeeting(meetingId);
      setMeetingTasks(updatedTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract tasks');
    } finally {
      setIsExtractingTasks(false);
    }
  }, [meetingId, settings, loadTasksForMeeting]);

  // Handle toggle task
  const handleToggleTask = useCallback(
    async (taskId: string, currentStatus: string) => {
      if (!meetingId) return;
      try {
        if (currentStatus === 'completed') {
          await reopenTask(taskId);
        } else {
          await completeTask(taskId);
        }
        const updatedTasks = await loadTasksForMeeting(meetingId);
        setMeetingTasks(updatedTasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update task');
      }
    },
    [meetingId, completeTask, reopenTask, loadTasksForMeeting]
  );

  // Handle speaker assignment
  const handleAssignSpeaker = useCallback(
    (segmentId: string, speakerId: string) => {
      const segment = liveTranscript.find((s) => s.id === segmentId);
      if (segment) {
        const updated = confirmSpeakerAssignment(
          { ...segment, speakerId: segment.speakerId ?? null },
          speakerId
        );
        updateTranscriptSegment(segmentId, {
          speakerId: updated.speakerId,
          confirmed: updated.confirmed,
          confidence: updated.confidence,
          suggestedSpeakerId: undefined,
        });
      }
    },
    [liveTranscript, updateTranscriptSegment]
  );

  // Handle speaker suggestion rejection
  const handleRejectSuggestion = useCallback(
    (segmentId: string) => {
      const segment = liveTranscript.find((s) => s.id === segmentId);
      if (segment) {
        const updated = rejectSpeakerSuggestion({
          ...segment,
          speakerId: segment.speakerId ?? null,
        });
        updateTranscriptSegment(segmentId, {
          suggestedSpeakerId: undefined,
          confidence: updated.confidence,
        });
      }
    },
    [liveTranscript, updateTranscriptSegment]
  );

  // Handle create new speaker
  const handleCreateSpeaker = useCallback(
    async (name: string): Promise<SpeakerProfile> => {
      return await createSpeaker({ name });
    },
    [createSpeaker]
  );

  // Handle download markdown
  const handleDownloadMarkdown = useCallback(() => {
    if (!currentMeeting || !meetingId) return;
    const markdown = exportMeetingToMarkdown(currentMeeting);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-${meetingId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentMeeting, meetingId]);

  // Render states
  const isLive = currentMeeting?.status === 'in-progress';
  const isCompleted = currentMeeting?.status === 'completed';
  // Consistent check: live transcript or saved segments exist
  const hasTranscript = liveTranscript.length > 0 ||
                        (currentMeeting?.transcript?.segments?.length ?? 0) > 0;
  const hasSummary = currentMeeting?.summary;

  if (!meetingId) {
    return null;
  }

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

        <div className="titlebar-no-drag flex items-center gap-3">
          {isLive && <LiveTimer />}

          {isCompleted && (
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/10"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          )}
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

        {/* API Key Warning */}
        {!settings.openaiApiKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 rounded-[var(--radius-lg)] bg-warning/10 p-4 text-center text-sm text-warning"
          >
            Bitte füge deinen OpenAI API Key in den Einstellungen hinzu.
          </motion.div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recording Controls */}
            {!isCompleted && (
              <GlassCard>
                <div className="flex items-center justify-center gap-4">
                  {!isLive ? (
                    <button
                      onClick={handleStartRecording}
                      disabled={!settings.openaiApiKey}
                      className="flex items-center gap-2 rounded-full bg-success px-6 py-3 text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                    >
                      <Play className="h-5 w-5" />
                      Meeting starten
                    </button>
                  ) : (
                    <>
                      {/* Start/Stop Recording Button */}
                      <button
                        onClick={isRecorderActive ? handleStopRecording : handleStartRecording}
                        disabled={isChunkProcessing && pendingChunks > 3}
                        className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                          isRecorderActive && !isPaused
                            ? 'bg-error text-white animate-pulse'
                            : isPaused
                            ? 'bg-warning text-white'
                            : 'bg-primary text-white'
                        }`}
                      >
                        {isRecorderActive ? (
                          <MicOff className="h-6 w-6" />
                        ) : (
                          <Mic className="h-6 w-6" />
                        )}
                      </button>

                      {/* Pause/Resume Button */}
                      {isRecorderActive && (
                        <button
                          onClick={isPaused ? resumeTranscription : pauseTranscription}
                          className={`flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
                            isPaused
                              ? 'bg-success text-white hover:bg-success/90'
                              : 'bg-warning/20 text-warning hover:bg-warning/30'
                          }`}
                        >
                          {isPaused ? (
                            <>
                              <Play className="h-4 w-4" />
                              Fortsetzen
                            </>
                          ) : (
                            <>
                              <Pause className="h-4 w-4" />
                              Pausieren
                            </>
                          )}
                        </button>
                      )}

                      {/* End Meeting Button */}
                      <button
                        onClick={handleEndMeeting}
                        disabled={isRecorderActive || (isChunkProcessing && pendingChunks > 0)}
                        className="flex items-center gap-2 rounded-full bg-foreground/10 px-4 py-2 text-foreground-secondary transition-colors hover:bg-foreground/20 disabled:opacity-50"
                      >
                        <Square className="h-4 w-4" />
                        Meeting beenden
                      </button>
                    </>
                  )}
                </div>

                {/* Live Status UI */}
                {isLive && isRecorderActive && (
                  <div className="mt-4 flex items-center justify-center gap-4">
                    {/* Speaking Indicator */}
                    {isSpeaking && (
                      <span className="flex items-center gap-1.5 text-success">
                        <Volume2 className="h-4 w-4 animate-pulse" />
                        <span className="text-xs">Spricht...</span>
                      </span>
                    )}

                    {/* Pending Chunks - Shows transcription queue status */}
                    {pendingChunks > 0 && (
                      <span className="flex items-center gap-1.5 text-xs text-foreground-secondary">
                        <div className="h-2 w-2 animate-spin rounded-full border border-primary border-t-transparent" />
                        Transkribiere... ({pendingChunks} ausstehend)
                      </span>
                    )}

                    {/* Speaker Detection Status */}
                    {(settings.autoSpeakerDetection ?? true) && isDiarizing && (
                      <span className="flex items-center gap-1.5 text-xs text-primary">
                        <Users className="h-3.5 w-3.5 animate-pulse" />
                        Sprecher erkennen...
                      </span>
                    )}

                    {/* Pause Status */}
                    {isPaused && (
                      <span className="text-xs font-medium text-warning">
                        Pausiert
                      </span>
                    )}
                  </div>
                )}

                {isLive && !isRecorderActive && (
                  <div className="mt-3 text-center">
                    <p className="text-xs text-foreground-secondary">
                      Klicke auf das Mikrofon, um die Aufnahme zu starten.
                    </p>
                  </div>
                )}
              </GlassCard>
            )}

            {/* Transcript */}
            <GlassCard>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                  Transkript
                </h2>
                <div className="flex items-center gap-2">
                  {hasTranscript && (
                    <button
                      onClick={() => setShowKeywords(!showKeywords)}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                        showKeywords
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      Keywords
                    </button>
                  )}
                  {hasTranscript && (
                    <button
                      onClick={() => setShowSpeakerControls(!showSpeakerControls)}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                        showSpeakerControls
                          ? 'bg-primary/10 text-primary'
                          : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
                      }`}
                    >
                      <Users className="h-3 w-3" />
                      Sprecher
                    </button>
                  )}
                  {hasTranscript && (
                    <span className="text-xs text-foreground-secondary">
                      {liveTranscript.length || currentMeeting.transcript?.segments.length || 0} Segmente
                    </span>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-foreground/5">
                {liveTranscript.length > 0 ? (
                  <>
                    {liveTranscript
                      .filter((segment, index, self) =>
                        index === self.findIndex(s => s.id === segment.id)
                      )
                      .map((segment, index) => (
                      <TranscriptSegmentView
                        key={segment.id}
                        segment={segment}
                        speakers={speakers}
                        meetingStart={currentMeeting.startedAt || currentMeeting.createdAt}
                        onAssignSpeaker={handleAssignSpeaker}
                        onRejectSuggestion={handleRejectSuggestion}
                        onCreateSpeaker={handleCreateSpeaker}
                        showSpeakerControls={showSpeakerControls}
                        showKeywords={showKeywords}
                        isLatest={index === liveTranscript.length - 1}
                      />
                    ))}
                    <div ref={transcriptEndRef} />
                  </>
                ) : currentMeeting.transcript ? (
                  currentMeeting.transcript.segments
                    .filter((segment, index, self) =>
                      index === self.findIndex(s => s.id === segment.id)
                    )
                    .map((segment, index) => (
                    <TranscriptSegmentView
                      key={segment.id}
                      segment={segment}
                      speakers={speakers}
                      meetingStart={currentMeeting.startedAt || currentMeeting.createdAt}
                      onAssignSpeaker={handleAssignSpeaker}
                      onRejectSuggestion={handleRejectSuggestion}
                      onCreateSpeaker={handleCreateSpeaker}
                      showSpeakerControls={showSpeakerControls}
                      showKeywords={showKeywords}
                      isLatest={index === currentMeeting.transcript!.segments.length - 1}
                    />
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-foreground-secondary">
                    Noch kein Transkript vorhanden.
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Summary (Post-Meeting) */}
            {isCompleted && (
              <GlassCard>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                    Zusammenfassung
                  </h2>
                  {!hasSummary && hasTranscript && (
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary || !settings.openaiApiKey}
                      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                      {isGeneratingSummary ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Generieren
                    </button>
                  )}
                </div>

                {hasSummary ? (
                  <div className="space-y-4">
                    {currentMeeting.summary?.overview && (
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-foreground-secondary">Überblick</h3>
                        <p className="text-sm text-foreground">{currentMeeting.summary.overview}</p>
                      </div>
                    )}

                    {currentMeeting.summary?.keyPoints && currentMeeting.summary.keyPoints.length > 0 && (
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-foreground-secondary">Wichtige Punkte</h3>
                        <ul className="list-inside list-disc text-sm text-foreground">
                          {currentMeeting.summary.keyPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {currentMeeting.summary?.decisions && currentMeeting.summary.decisions.length > 0 && (
                      <div>
                        <h3 className="mb-1 text-xs font-medium text-foreground-secondary">Entscheidungen</h3>
                        <ul className="list-inside list-disc text-sm text-foreground">
                          {currentMeeting.summary.decisions.map((d) => (
                            <li key={d.id}>{d.text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-foreground-secondary">
                    {hasTranscript
                      ? 'Klicke auf "Generieren", um eine Zusammenfassung zu erstellen.'
                      : 'Keine Zusammenfassung verfügbar.'}
                  </p>
                )}
              </GlassCard>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tasks */}
            <GlassCard>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                  Aufgaben
                </h2>
                {isCompleted && hasTranscript && (
                  <button
                    onClick={handleExtractTasks}
                    disabled={isExtractingTasks || !settings.openaiApiKey}
                    className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                  >
                    {isExtractingTasks ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    ) : (
                      <ListTodo className="h-3 w-3" />
                    )}
                    Extrahieren
                  </button>
                )}
              </div>

              {meetingTasks.length > 0 ? (
                <div className="divide-y divide-foreground/5">
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
                  {isCompleted && hasTranscript
                    ? 'Klicke auf "Extrahieren", um Aufgaben zu erkennen.'
                    : 'Noch keine Aufgaben.'}
                </p>
              )}
            </GlassCard>

            {/* Live Decisions */}
            {isLive && liveDetectedDecisions.length > 0 && (
              <GlassCard>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                    Entscheidungen
                  </h2>
                  <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                    {liveDetectedDecisions.length}
                  </span>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {liveDetectedDecisions.map((decision, index) => (
                    <div key={index} className="text-sm">
                      <p className="font-medium text-foreground">{decision.text}</p>
                      <p className="text-xs text-foreground-secondary">
                        {formatElapsedTime(decision.timestamp)} - {Math.round(decision.confidence * 100)}% sicher
                      </p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Live Questions */}
            {isLive && liveDetectedQuestions.filter(q => !q.isRhetorical).length > 0 && (
              <GlassCard>
                <div className="mb-3 flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-violet-500" />
                  <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                    Offene Fragen
                  </h2>
                  <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-500">
                    {liveDetectedQuestions.filter(q => !q.isRhetorical).length}
                  </span>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {liveDetectedQuestions.filter(q => !q.isRhetorical).map((question, index) => (
                    <div key={index} className="text-sm">
                      <p className="text-foreground">{question.text}</p>
                      <p className="text-xs text-foreground-secondary">
                        {formatElapsedTime(question.timestamp)}
                      </p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Project Context */}
            {isLive && projectContext && projectMatches.length > 0 && (
              <GlassCard>
                <button
                  onClick={() => setShowProjectContext(!showProjectContext)}
                  className="flex w-full items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-emerald-500" />
                    <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                      Projekt-Dateien
                    </h2>
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                      {projectMatches.length}
                    </span>
                  </div>
                  {showProjectContext ? (
                    <ChevronUp className="h-4 w-4 text-foreground-secondary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                  )}
                </button>
                <AnimatePresence>
                  {showProjectContext && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                        <p className="text-xs text-foreground-secondary">
                          Erkannte Dateien im Gespräch:
                        </p>
                        {projectMatches.map((match, index) => (
                          <div
                            key={`${match.file.path}-${index}`}
                            className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-background-secondary/50 p-2"
                          >
                            <FileCode2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {match.file.name}
                              </p>
                              <p className="text-[10px] text-foreground-secondary truncate">
                                {match.file.path}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={`text-[10px] px-1 py-0.5 rounded ${
                                  match.matchType === 'exact'
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : match.matchType === 'partial'
                                    ? 'bg-amber-500/10 text-amber-500'
                                    : 'bg-foreground/10 text-foreground-secondary'
                                }`}>
                                  {match.matchType === 'exact' ? 'Exakt' : match.matchType === 'partial' ? 'Teilweise' : 'Ähnlich'}
                                </span>
                                <span className="text-[10px] text-foreground-secondary">
                                  "{match.matchedText}"
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            )}

            {/* Live Research */}
            {isLive && (
              <GlassCard>
                <button
                  onClick={() => setShowResearch(!showResearch)}
                  className="flex w-full items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                      Recherche
                    </h2>
                    {researchSuggestions.length > 0 && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {researchSuggestions.length}
                      </span>
                    )}
                  </div>
                  {showResearch ? (
                    <ChevronUp className="h-4 w-4 text-foreground-secondary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                  )}
                </button>
                <AnimatePresence>
                  {showResearch && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 -mx-4 -mb-4 border-t border-foreground/5">
                        <ResearchPanel
                          meetingId={meetingId || undefined}
                          transcript={liveTranscript.map(s => s.text).join(' ')}
                          compact
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            )}

            {/* Agenda */}
            {currentMeeting.agenda.length > 0 && (
              <GlassCard>
                <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                  Agenda
                </h2>
                <div className="space-y-2">
                  {currentMeeting.agenda.map((item) => (
                    <div key={item.id} className="flex items-start gap-2">
                      <div
                        className={`mt-1 h-3 w-3 rounded-full ${
                          item.completed ? 'bg-success' : 'bg-foreground/20'
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          item.completed ? 'text-foreground-secondary line-through' : 'text-foreground'
                        }`}
                      >
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Meeting Info */}
            <GlassCard variant="subtle">
              <h2 className="mb-3 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                Meeting-Info
              </h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-foreground-secondary">Status</dt>
                  <dd className="text-foreground capitalize">
                    {currentMeeting.status === 'in-progress' ? 'Läuft' : currentMeeting.status}
                  </dd>
                </div>
                {currentMeeting.startedAt && (
                  <div className="flex justify-between">
                    <dt className="text-foreground-secondary">Gestartet</dt>
                    <dd className="text-foreground">
                      {format(currentMeeting.startedAt, 'HH:mm', { locale: de })}
                    </dd>
                  </div>
                )}
                {currentMeeting.endedAt && (
                  <div className="flex justify-between">
                    <dt className="text-foreground-secondary">Beendet</dt>
                    <dd className="text-foreground">
                      {format(currentMeeting.endedAt, 'HH:mm', { locale: de })}
                    </dd>
                  </div>
                )}
                {currentMeeting.transcript && (
                  <div className="flex justify-between">
                    <dt className="text-foreground-secondary">Dauer</dt>
                    <dd className="text-foreground">
                      {formatElapsedTime(currentMeeting.transcript.duration)}
                    </dd>
                  </div>
                )}
              </dl>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}

// Main page component with Suspense for useSearchParams
export default function LiveMeetingPage() {
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
      <LiveMeetingContent />
    </Suspense>
  );
}
