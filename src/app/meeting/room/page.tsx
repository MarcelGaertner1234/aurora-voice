'use client';

import React, { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Clock,
  Users,
  FileText,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Check,
  X,
  MessageSquare,
  ListTodo,
  HelpCircle,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  FileCode2,
  RefreshCw,
  Trash2,
  Mic,
  Plus,
  Search,
  UserPlus,
  ClipboardList,
  Paperclip,
  Calendar,
  CircleDot,
  SortDesc,
  ExternalLink,
  Bot,
  Send,
  Code,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useProjectStore } from '@/lib/store/project-store';
import { useTaskStore } from '@/lib/store/task-store';
import { useAppStore } from '@/lib/store/settings';
import type { Task, TaskAttachment } from '@/types/task';
import { useRecorder } from '@/hooks/use-recorder';
import { transcribeAudioWithChunking } from '@/lib/ai/transcribe';
import { processPostMeeting } from '@/lib/meetings/post';
import { formatAbsoluteTimestamp } from '@/lib/meetings/engine';
import { useSpeakerStore } from '@/lib/store/speaker-store';
import { GlassCard } from '@/components/ui/glass-card';
import { AnimatedOrb } from '@/components/ui/animated-orb';
import { StreamingText } from '@/components/output/streaming-text';
import { AudioPlayerCompact } from '@/components/ui/audio-player';
import type { Meeting, MeetingStatus, MeetingRecording, MeetingQuestion, MeetingDecision } from '@/types/meeting';
import type { AgentMessage, SelectedContextItem } from '@/types/agent';
import { AGENT_QUICK_ACTIONS } from '@/types/agent';
import { streamAgentResponse, ContentSearchResult } from '@/lib/ai/agent';
import { webSearchManager } from '@/lib/research/web-search';
import { v4 as uuidv4 } from 'uuid';

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-2 text-sm text-foreground-secondary">Lade Meeting...</p>
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: MeetingStatus }) {
  const config = {
    scheduled: { label: 'Geplant', color: 'bg-primary/20 text-primary' },
    'in-progress': { label: 'Läuft', color: 'bg-success/20 text-success' },
    completed: { label: 'Abgeschlossen', color: 'bg-foreground/20 text-foreground-secondary' },
    cancelled: { label: 'Abgesagt', color: 'bg-error/20 text-error' },
  };

  const { label, color } = config[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-foreground/5 bg-background-secondary/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-foreground-secondary" />
          <span className="font-medium text-foreground">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-foreground-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-foreground-secondary" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-foreground/5 p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MeetingRoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = searchParams.get('id');

  const {
    currentMeeting,
    setCurrentMeeting,
    setActiveRoom,
    updateMeeting,
    endMeeting,
    addTranscriptSegment,
    mergeSummary,
    setSummary,
    addRecording,
    loadRecordings,
    deleteRecording,
    loadMeetings,
    updateQuestionAnswer,
    updateDecisionAssignee,
    updateQuestionAssignee,
  } = useMeetingStore();

  const {
    recordingState,
    setRecordingState,
    settings,
    setTranscript,
    enrichedContent,
    setEnrichedContent,
    appendEnrichedContent,
    error,
    setError,
    addRecentProject,
    addTranscriptionUsage,
    audioLevel,
  } = useAppStore();

  const { loadTasksForMeeting, setTaskStatus, updateTaskNotes, updateTask, addTaskAttachment, removeTaskAttachment } = useTaskStore();
  const { toggleRecording } = useRecorder();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meetingNotFound, setMeetingNotFound] = useState(false); // Fix 3: Track if meeting doesn't exist
  const [showPathInput, setShowPathInput] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [meetingTasks, setMeetingTasks] = useState<Task[]>([]);
  const [meetingRecordings, setMeetingRecordings] = useState<MeetingRecording[]>([]);
  const [activeTab, setActiveTab] = useState<'meeting' | 'actions' | 'ai'>('meeting');
  const [taskSortBy, setTaskSortBy] = useState<'priority' | 'date'>('priority');
  const [editingTaskNotes, setEditingTaskNotes] = useState<string | null>(null);
  const [taskNotesValue, setTaskNotesValue] = useState<string>('');
  const [editingQuestionAnswer, setEditingQuestionAnswer] = useState<string | null>(null);
  const [questionAnswerValue, setQuestionAnswerValue] = useState<string>('');
  const [actionsSubTab, setActionsSubTab] = useState<'tasks' | 'completed' | 'decisions' | 'questions'>('tasks');
  const [newDecision, setNewDecision] = useState('');
  const [newDecisionAssigneeId, setNewDecisionAssigneeId] = useState<string | undefined>(undefined);
  const [newDecisionAssigneeName, setNewDecisionAssigneeName] = useState<string | undefined>(undefined);
  const [showDecisionAssigneeDropdown, setShowDecisionAssigneeDropdown] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newQuestionAssigneeId, setNewQuestionAssigneeId] = useState<string | undefined>(undefined);
  const [newQuestionAssigneeName, setNewQuestionAssigneeName] = useState<string | undefined>(undefined);
  const [showQuestionAssigneeDropdown, setShowQuestionAssigneeDropdown] = useState(false);

  // State for editing existing item assignees
  const [editingDecisionAssignee, setEditingDecisionAssignee] = useState<string | null>(null);
  const [editingQuestionAssignee, setEditingQuestionAssignee] = useState<string | null>(null);
  const [editingTaskAssignee, setEditingTaskAssignee] = useState<string | null>(null);

  // AI Agent state
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);
  const [currentAgentStreamingContent, setCurrentAgentStreamingContent] = useState('');
  const agentAbortControllerRef = useRef<AbortController | null>(null);
  const agentChatEndRef = useRef<HTMLDivElement>(null);

  // Related meetings state (Improvement 3: Meeting history for project context)
  const [relatedMeetings, setRelatedMeetings] = useState<Meeting[]>([]);

  // Context sidebar state
  const [selectedContextItem, setSelectedContextItem] = useState<SelectedContextItem | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Reset editing state when switching tabs to prevent data corruption
  useEffect(() => {
    setEditingTaskNotes(null);
    setTaskNotesValue('');
  }, [activeTab]);

  // Project store
  const {
    getOrIndexProject,
    reindexProject,
    clearProjectFromCache,
    isProjectIndexing,
    getIndexingProgress,
    getIndexingPhase,
    getIndexingError,
    getCachedProject,
  } = useProjectStore();

  // Project context for current meeting
  const projectPath = currentMeeting?.projectPath;
  const isIndexing = projectPath ? isProjectIndexing(projectPath) : false;
  const indexProgress = projectPath ? getIndexingProgress(projectPath) : 0;
  const indexPhase = projectPath ? getIndexingPhase(projectPath) : null;
  const indexError = projectPath ? getIndexingError(projectPath) : null;
  const projectContext = projectPath ? getCachedProject(projectPath) : null;

  // Redirect if no meeting ID
  useEffect(() => {
    if (!meetingId) {
      router.push('/');
    }
  }, [meetingId, router]);

  // Load meeting on mount only
  useEffect(() => {
    const loadMeeting = async () => {
      if (meetingId) {
        // Load meetings from IndexedDB (single source of truth)
        await loadMeetings();
        await setCurrentMeeting(meetingId);
        setActiveRoom(meetingId);

        // Debug: Log loaded meeting data
        const loadedMeeting = useMeetingStore.getState().currentMeeting;
        console.log('Loaded meeting:', {
          id: loadedMeeting?.id,
          title: loadedMeeting?.title,
          participantIds: loadedMeeting?.participantIds,
          projectPath: loadedMeeting?.projectPath,
        });

        // Load tasks for this meeting
        const tasks = await loadTasksForMeeting(meetingId);
        setMeetingTasks(tasks);

        // Load recordings for this meeting
        const recordings = await loadRecordings(meetingId);
        setMeetingRecordings(recordings);

        // Check if meeting was found
        setTimeout(() => {
          const state = useMeetingStore.getState();
          if (state.currentMeetingId === meetingId && !state.currentMeeting) {
            setMeetingNotFound(true);
          }
        }, 500);
      }
    };
    loadMeeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, setCurrentMeeting, setActiveRoom, loadMeetings, loadTasksForMeeting]);  // OHNE settings.recentProjects!

  // Migrate existing project paths from meetings to recentProjects
  useEffect(() => {
    const migrateProjects = async () => {
      if ((settings.recentProjects?.length ?? 0) === 0) {
        await loadMeetings();
        const { meetings } = useMeetingStore.getState();
        const paths = [...new Set(
          (meetings || [])
            .map((m) => m.projectPath)
            .filter((p): p is string => Boolean(p))
        )];
        paths.forEach((p) => addRecentProject(p));
      }
    };
    migrateProjects();
  }, []); // Run once on mount

  // Load project index when meeting has a projectPath but context is not yet loaded
  useEffect(() => {
    if (projectPath && !projectContext && !isIndexing) {
      getOrIndexProject(projectPath).catch((err) => {
        console.error('Failed to load project context:', err);
      });
    }
  }, [projectPath, projectContext, isIndexing, getOrIndexProject]);

  // Load related meetings when projectPath is set (Improvement 3: Meeting history)
  useEffect(() => {
    if (projectPath && currentMeeting) {
      const loadRelatedMeetings = async () => {
        await loadMeetings();
        const { meetings } = useMeetingStore.getState();
        // Filter meetings that have the same projectPath (excluding current meeting)
        const related = (meetings || [])
          .filter(m => m.projectPath === projectPath && m.id !== currentMeeting.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10); // Limit to 10 most recent
        setRelatedMeetings(related);
      };
      loadRelatedMeetings();
    } else {
      setRelatedMeetings([]);
    }
  }, [projectPath, currentMeeting?.id, loadMeetings]);

  // Update edit title when meeting loads
  useEffect(() => {
    if (currentMeeting) {
      setEditTitle(currentMeeting.title);
    }
  }, [currentMeeting]);

  // Handle title save
  const handleSaveTitle = async () => {
    if (meetingId && editTitle.trim() && editTitle !== currentMeeting?.title) {
      await updateMeeting(meetingId, { title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  // Helper for Tauri check
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

  // Handle select project folder
  const handleSelectProjectFolder = useCallback(async () => {
    if (!meetingId) return;

    // Check if Tauri is available
    if (!isTauri) {
      // Browser fallback: show dropdown
      setShowProjectDropdown(true);
      return;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Export-Ordner auswählen',
      });

      if (selected && typeof selected === 'string') {
        try {
          await updateMeeting(meetingId, { projectPath: selected });
          addRecentProject(selected);
          await getOrIndexProject(selected);
          // Dropdown schließen nach Erfolg
          setShowProjectDropdown(false);
        } catch (updateErr) {
          console.error('Failed to update meeting with project path:', updateErr);
          setError(`Projekt konnte nicht verknüpft werden: ${updateErr instanceof Error ? updateErr.message : 'Unbekannter Fehler'}`);
        }
      }
    } catch (err) {
      // Nur hier: Dialog konnte nicht geöffnet werden → Fallback
      console.error('Tauri dialog failed, falling back to dropdown:', err);
      setShowProjectDropdown(true);
    }
  }, [meetingId, updateMeeting, getOrIndexProject, addRecentProject, isTauri, setError]);

  // Handle select from recent projects dropdown
  const handleSelectRecentProject = useCallback(async (path: string) => {
    if (!meetingId) return;
    await updateMeeting(meetingId, { projectPath: path });
    addRecentProject(path);
    await getOrIndexProject(path);
    setShowProjectDropdown(false);
  }, [meetingId, updateMeeting, getOrIndexProject, addRecentProject]);

  // Handle reindex project
  const handleReindexProject = useCallback(async () => {
    if (!projectPath) return;
    await reindexProject(projectPath);
  }, [projectPath, reindexProject]);

  // Handle remove project
  const handleRemoveProject = useCallback(async () => {
    if (!meetingId || !projectPath) return;
    clearProjectFromCache(projectPath);
    await updateMeeting(meetingId, { projectPath: undefined });
  }, [meetingId, projectPath, clearProjectFromCache, updateMeeting]);

  // Handle export meeting to project folder
  const handleExportMeeting = useCallback(async () => {
    if (!meetingId || !projectPath) return;
    setIsExporting(true);
    try {
      const { exportMeetingNow } = useMeetingStore.getState();
      await exportMeetingNow(meetingId);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export fehlgeschlagen');
    } finally {
      setIsExporting(false);
    }
  }, [meetingId, projectPath, setError]);

  // Handle manual path submit (browser fallback)
  const handleManualPathSubmit = useCallback(async () => {
    if (!meetingId || !manualPath.trim()) return;

    const path = manualPath.trim();
    await updateMeeting(meetingId, { projectPath: path });
    addRecentProject(path);
    await getOrIndexProject(path);
    setShowPathInput(false);
    setShowProjectDropdown(false);
    setManualPath('');
  }, [meetingId, manualPath, updateMeeting, getOrIndexProject, addRecentProject]);

  // Get speakers for processPostMeeting and participant management
  const { speakers, loadSpeakers, createSpeaker } = useSpeakerStore();
  const { createTasks } = useTaskStore();

  // Participant management state
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [isCreatingParticipant, setIsCreatingParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');

  // Load speakers on mount
  useEffect(() => {
    loadSpeakers();
  }, [loadSpeakers]);

  // Get participants for this meeting
  const meetingParticipants = currentMeeting?.participantIds
    .map(id => speakers.find(s => s.id === id))
    .filter((s): s is typeof speakers[0] => s !== undefined) || [];

  // Handle adding participant to meeting
  const handleAddParticipant = useCallback(async (speakerId: string) => {
    if (!meetingId || !currentMeeting) return;
    const newParticipantIds = [...currentMeeting.participantIds, speakerId];
    console.log('Adding participant:', {
      meetingId,
      speakerId,
      oldParticipantIds: currentMeeting.participantIds,
      newParticipantIds,
    });
    await updateMeeting(meetingId, { participantIds: newParticipantIds });
    console.log('Participant added successfully');
    setParticipantSearch('');
    setShowAddParticipant(false);
  }, [meetingId, currentMeeting, updateMeeting]);

  // Handle removing participant from meeting
  const handleRemoveParticipant = useCallback(async (speakerId: string) => {
    if (!meetingId || !currentMeeting) return;
    const newParticipantIds = currentMeeting.participantIds.filter(id => id !== speakerId);
    await updateMeeting(meetingId, { participantIds: newParticipantIds });
  }, [meetingId, currentMeeting, updateMeeting]);

  // Handle creating new participant
  const handleCreateParticipant = useCallback(async () => {
    if (!newParticipantName.trim()) return;
    try {
      const speaker = await createSpeaker({ name: newParticipantName.trim() });
      await handleAddParticipant(speaker.id);
      setNewParticipantName('');
      setIsCreatingParticipant(false);
    } catch (err) {
      console.error('Failed to create participant:', err);
    }
  }, [newParticipantName, createSpeaker, handleAddParticipant]);

  // Filter speakers for dropdown (exclude already added)
  const availableSpeakers = speakers.filter(
    s => !currentMeeting?.participantIds.includes(s.id) &&
    s.name.toLowerCase().includes(participantSearch.toLowerCase())
  );

  // Handle deleting a recording (for incompatible formats)
  const handleDeleteRecording = useCallback(async (recordingId: string) => {
    if (!meetingId) return;
    try {
      await deleteRecording(recordingId);
      // Reload recordings after deletion
      const recordings = await loadRecordings(meetingId);
      setMeetingRecordings(recordings);
    } catch (err) {
      console.error('Failed to delete recording:', err);
      setError('Aufnahme konnte nicht gelöscht werden');
    }
  }, [meetingId, deleteRecording, loadRecordings, setError]);

  // Handle toggling task completion
  const handleToggleTask = useCallback(async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      await setTaskStatus(taskId, newStatus as 'pending' | 'in-progress' | 'completed' | 'cancelled');
      // Update local state
      setMeetingTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: newStatus as 'pending' | 'in-progress' | 'completed' | 'cancelled' } : t
      ));
    } catch (err) {
      console.error('Failed to toggle task:', err);
      setError('Aufgabe konnte nicht aktualisiert werden');
    }
  }, [setTaskStatus, setError]);

  // Handle marking question as answered
  const handleMarkQuestionAnswered = useCallback(async (questionId: string) => {
    if (!meetingId || !currentMeeting?.summary) return;
    try {
      const updatedQuestions = currentMeeting.summary.openQuestions?.map(q =>
        q.id === questionId ? { ...q, answered: !q.answered } : q
      ) || [];

      await setSummary(meetingId, {
        ...currentMeeting.summary,
        openQuestions: updatedQuestions,
      });
    } catch (err) {
      console.error('Failed to mark question as answered:', err);
      setError('Frage konnte nicht aktualisiert werden');
    }
  }, [meetingId, currentMeeting, setSummary, setError]);

  // Handle context item selection with input pre-fill
  const handleSelectContextItem = useCallback((item: SelectedContextItem | null) => {
    setSelectedContextItem(item);

    // Pre-fill input when item is selected
    if (item) {
      let prefillText = '';
      switch (item.type) {
        case 'task':
          prefillText = `Hilf mir bei dieser Aufgabe: "${item.title}"`;
          break;
        case 'question':
          prefillText = `Beantworte diese Frage: "${item.title}"`;
          break;
        case 'decision':
          prefillText = `Erkläre diese Entscheidung: "${item.title}"`;
          break;
      }

      // Pre-fill input (don't send!)
      setAgentInput(prefillText);

      // Switch to AI tab
      setActiveTab('ai');
    }
  }, []);

  // Handle saving task notes
  const handleSaveTaskNotes = useCallback(async (taskId: string) => {
    try {
      await updateTaskNotes(taskId, taskNotesValue);
      // Update local state
      setMeetingTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, notes: taskNotesValue } : t
      ));
      setEditingTaskNotes(null);
      setTaskNotesValue('');
    } catch (err) {
      console.error('Failed to save task notes:', err);
      setError('Notiz konnte nicht gespeichert werden');
    }
  }, [taskNotesValue, updateTaskNotes, setError]);

  // Handle adding file attachment to task
  const handleAddTaskAttachment = useCallback(async (taskId: string) => {
    // Check if Tauri is available
    if (!isTauri) {
      setError('Datei-Anhänge sind nur in der Desktop-App verfügbar');
      return;
    }

    try {
      const selected = await open({
        multiple: true,
        title: 'Dateien auswählen',
      });

      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        for (const filePath of files) {
          if (typeof filePath === 'string') {
            const fileName = filePath.split('/').pop() || filePath;
            await addTaskAttachment(taskId, { name: fileName, path: filePath });
          }
        }
        // Reload tasks
        if (meetingId) {
          const tasks = await loadTasksForMeeting(meetingId);
          setMeetingTasks(tasks);
        }
      }
    } catch (err) {
      console.error('Failed to add attachment:', err);
      setError('Datei konnte nicht hinzugefügt werden');
    }
  }, [isTauri, addTaskAttachment, loadTasksForMeeting, meetingId, setError]);

  // Handle removing file attachment from task
  const handleRemoveTaskAttachment = useCallback(async (taskId: string, attachmentId: string) => {
    try {
      await removeTaskAttachment(taskId, attachmentId);
      // Update local state
      setMeetingTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, attachments: (t.attachments || []).filter(a => a.id !== attachmentId) } : t
      ));
    } catch (err) {
      console.error('Failed to remove attachment:', err);
      setError('Anhang konnte nicht entfernt werden');
    }
  }, [removeTaskAttachment, setError]);

  // Handle opening a file attachment
  const handleOpenFile = useCallback(async (filePath: string) => {
    if (!filePath) {
      setError('Kein Dateipfad vorhanden');
      return;
    }
    if (!isTauri) {
      setError('Dateien öffnen ist nur in der Desktop-App verfügbar');
      return;
    }
    try {
      await shellOpen(filePath);
    } catch (err) {
      console.error('Failed to open file:', err);
      setError('Datei konnte nicht geöffnet werden');
    }
  }, [isTauri, setError]);

  // Handle saving question answer
  const handleSaveQuestionAnswer = useCallback(async (questionId: string) => {
    if (!meetingId) return;
    try {
      await updateQuestionAnswer(meetingId, questionId, questionAnswerValue);
      setEditingQuestionAnswer(null);
      setQuestionAnswerValue('');
    } catch (err) {
      console.error('Failed to save question answer:', err);
      setError('Antwort konnte nicht gespeichert werden');
    }
  }, [meetingId, questionAnswerValue, updateQuestionAnswer, setError]);

  // Handle adding new decision
  const handleAddDecision = useCallback(async () => {
    if (!meetingId || !currentMeeting || !newDecision.trim()) return;
    try {
      const newDecisionItem = {
        id: `decision-${Date.now()}`,
        text: newDecision.trim(),
        timestamp: Date.now(),
        participants: [],
        status: 'decided' as const,
        assigneeId: newDecisionAssigneeId,
        assigneeName: newDecisionAssigneeName,
      };

      const updatedDecisions = [
        ...(currentMeeting.summary?.decisions || []),
        newDecisionItem,
      ];

      await setSummary(meetingId, {
        ...currentMeeting.summary,
        overview: currentMeeting.summary?.overview || '',
        keyPoints: currentMeeting.summary?.keyPoints || [],
        decisions: updatedDecisions,
        openQuestions: currentMeeting.summary?.openQuestions || [],
        generatedAt: currentMeeting.summary?.generatedAt || new Date(),
      });

      setNewDecision('');
      setNewDecisionAssigneeId(undefined);
      setNewDecisionAssigneeName(undefined);
      setShowDecisionAssigneeDropdown(false);
    } catch (err) {
      console.error('Failed to add decision:', err);
      setError('Entscheidung konnte nicht hinzugefügt werden');
    }
  }, [meetingId, currentMeeting, newDecision, newDecisionAssigneeId, newDecisionAssigneeName, setSummary, setError]);

  // Handle adding new question
  const handleAddQuestion = useCallback(async () => {
    if (!meetingId || !currentMeeting || !newQuestion.trim()) return;
    try {
      const newQuestionItem = {
        id: `question-${Date.now()}`,
        text: newQuestion.trim(),
        answered: false,
        timestamp: Date.now(),
        assigneeId: newQuestionAssigneeId,
        assigneeName: newQuestionAssigneeName,
      };

      const updatedQuestions = [
        ...(currentMeeting.summary?.openQuestions || []),
        newQuestionItem,
      ];

      await setSummary(meetingId, {
        ...currentMeeting.summary,
        overview: currentMeeting.summary?.overview || '',
        keyPoints: currentMeeting.summary?.keyPoints || [],
        decisions: currentMeeting.summary?.decisions || [],
        openQuestions: updatedQuestions,
        generatedAt: currentMeeting.summary?.generatedAt || new Date(),
      });

      setNewQuestion('');
      setNewQuestionAssigneeId(undefined);
      setNewQuestionAssigneeName(undefined);
      setShowQuestionAssigneeDropdown(false);
    } catch (err) {
      console.error('Failed to add question:', err);
      setError('Frage konnte nicht hinzugefügt werden');
    }
  }, [meetingId, currentMeeting, newQuestion, newQuestionAssigneeId, newQuestionAssigneeName, setSummary, setError]);

  // Handle updating decision assignee
  const handleUpdateDecisionAssignee = useCallback(async (
    decisionId: string,
    assigneeId?: string,
    assigneeName?: string
  ) => {
    if (!meetingId) return;
    try {
      await updateDecisionAssignee(meetingId, decisionId, assigneeId, assigneeName);
      setEditingDecisionAssignee(null);
    } catch (err) {
      console.error('Failed to update decision assignee:', err);
      setError('Verantwortlicher konnte nicht aktualisiert werden');
    }
  }, [meetingId, updateDecisionAssignee, setError]);

  // Handle updating question assignee
  const handleUpdateQuestionAssignee = useCallback(async (
    questionId: string,
    assigneeId?: string,
    assigneeName?: string
  ) => {
    if (!meetingId) return;
    try {
      await updateQuestionAssignee(meetingId, questionId, assigneeId, assigneeName);
      setEditingQuestionAssignee(null);
    } catch (err) {
      console.error('Failed to update question assignee:', err);
      setError('Verantwortlicher konnte nicht aktualisiert werden');
    }
  }, [meetingId, updateQuestionAssignee, setError]);

  // Handle updating task assignee
  const handleUpdateTaskAssignee = useCallback(async (
    taskId: string,
    assigneeName?: string
  ) => {
    try {
      await updateTask(taskId, { assigneeName });
      // Update local state
      setMeetingTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, assigneeName } : t
      ));
      setEditingTaskAssignee(null);
    } catch (err) {
      console.error('Failed to update task assignee:', err);
      setError('Verantwortlicher konnte nicht aktualisiert werden');
    }
  }, [updateTask, setError]);

  // Sort tasks by priority (urgent > high > medium > low) or by date
  const sortedTasks = [...meetingTasks].sort((a, b) => {
    if (taskSortBy === 'priority') {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // Secondary sort by status (pending first, then in-progress, then completed)
      const statusOrder = { pending: 0, 'in-progress': 1, completed: 2, cancelled: 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    } else {
      // Sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  // Process new recording
  const processRecording = useCallback(
    async (audioBlob: Blob) => {
      if (!meetingId) return;

      try {
        setRecordingState('transcribing');
        const result = await transcribeAudioWithChunking(
          audioBlob,
          settings.openaiApiKey,
          settings.language
        );
        setTranscript(result.text);
        addTranscriptionUsage(result.duration || 0);

        // Convert duration from seconds (Whisper API) to milliseconds (internal format)
        const durationMs = (result.duration || 0) * 1000;

        // Add transcript segment to meeting (MUST await to ensure it's saved before processing)
        await addTranscriptSegment({
          speakerId: null,
          confidence: 1,
          confirmed: false,
          text: result.text,
          startTime: Date.now(),
          endTime: Date.now() + durationMs,
        });

        // Save audio recording to IndexedDB
        await addRecording(meetingId, audioBlob, audioBlob.type, durationMs);

        // Reload recordings immediately to ensure UI shows the recording
        const updatedRecordings = await loadRecordings(meetingId);
        setMeetingRecordings(updatedRecordings);

        // End meeting and update currentMeeting
        setRecordingState('enriching');
        setEnrichedContent('');
        setIsStreaming(true);

        await endMeeting(meetingId);
        await setCurrentMeeting(meetingId);

        // Post-Processing with correct AI extraction
        const updatedMeeting = useMeetingStore.getState().currentMeeting;
        if (updatedMeeting) {
          const postResult = await processPostMeeting(
            updatedMeeting,
            speakers,
            settings,
            (stage, progress) => {
              // Show progress in enrichedContent
              appendEnrichedContent(`${stage}\n`);
            },
            projectContext
          );

          setIsStreaming(false);
          setRecordingState('idle');

          // Merge summary (accumulates decisions, questions from follow-up recordings)
          await mergeSummary(meetingId, postResult.summary);

          // Create tasks if available
          if (postResult.tasks.length > 0) {
            const updatedMeetingForTasks = useMeetingStore.getState().currentMeeting;
            await createTasks(postResult.tasks.map(t => ({
              meetingId,
              title: t.title,
              assigneeName: t.assigneeName,
              priority: t.priority,
              sourceText: t.sourceText,
            })), updatedMeetingForTasks ?? undefined);
          }
        } else {
          setIsStreaming(false);
          setRecordingState('idle');
        }

        // Reload meeting data
        await setCurrentMeeting(meetingId);

        // Reload tasks for this meeting
        const tasks = await loadTasksForMeeting(meetingId);
        setMeetingTasks(tasks);

        // Reload recordings
        const recordings = await loadRecordings(meetingId);
        setMeetingRecordings(recordings);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        setError(message);
        setRecordingState('idle');
        setIsStreaming(false);
      }
    },
    [
      meetingId,
      settings,
      speakers,
      projectContext,
      setRecordingState,
      setTranscript,
      setEnrichedContent,
      appendEnrichedContent,
      setError,
      addTranscriptSegment,
      addRecording,
      endMeeting,
      mergeSummary,
      setCurrentMeeting,
      loadTasksForMeeting,
      loadRecordings,
      createTasks,
    ]
  );

  // Handle follow-up recording
  const handleFollowUpRecording = useCallback(async () => {
    const blob = await toggleRecording();
    if (blob) {
      processRecording(blob);
    }
  }, [toggleRecording, processRecording]);

  // Copy to clipboard (Fix 8: Validate content before copying)
  const copyToClipboard = useCallback(async (text: string) => {
    // Fix 8: Check if there's actual content to copy
    if (!text || text.trim() === '') {
      setError('Kein Inhalt zum Kopieren vorhanden');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [setError]);

  // Get full meeting content for copy/export
  const getMeetingContent = useCallback(() => {
    if (!currentMeeting) return '';

    const summary = currentMeeting.summary;

    // Build summary sections
    const overviewSection = summary?.overview
      ? `\n## Zusammenfassung\n\n${summary.overview}\n`
      : '';
    const keyPointsSection = summary?.keyPoints?.length
      ? `\n### Wichtige Punkte\n\n${summary.keyPoints.map(p => `- ${p}`).join('\n')}\n`
      : '';
    const decisionsSection = summary?.decisions?.length
      ? `\n### Entscheidungen\n\n${summary.decisions.map(d => `- **${d.text}**${d.context ? ` (${d.context})` : ''}`).join('\n')}\n`
      : '';
    const questionsSection = summary?.openQuestions?.length
      ? `\n### Offene Fragen\n\n${summary.openQuestions.map(q => `- ${q.text}${q.answered ? ' ✓' : ''}`).join('\n')}\n`
      : '';

    // Tasks from task store
    const tasksSection = meetingTasks.length > 0
      ? `\n### Aufgaben\n\n${meetingTasks.map(t => `- [ ] ${t.title}${t.assigneeName ? ` @${t.assigneeName}` : ''}`).join('\n')}\n`
      : '';

    return `# ${currentMeeting.title}

**Datum:** ${format(new Date(currentMeeting.createdAt), 'dd. MMMM yyyy, HH:mm', { locale: de })}
**Status:** ${currentMeeting.status}
${overviewSection}${keyPointsSection}${decisionsSection}${tasksSection}${questionsSection}
## Transkript

${currentMeeting.transcript?.fullText || 'Kein Transkript vorhanden.'}

---
_Erstellt mit Aurora Voice_`;
  }, [currentMeeting, meetingTasks]);

  // Download as markdown (Fix 8: Validate content before downloading)
  const downloadMarkdown = useCallback(async () => {
    if (!currentMeeting) return;

    // Fix 8: Check if there's meaningful content to download
    const hasTranscript = currentMeeting.transcript?.fullText && currentMeeting.transcript.fullText.trim() !== '';
    const summary = currentMeeting.summary;
    const hasSummary = Boolean(
      summary && (
        (summary.overview && summary.overview.trim() !== '') ||
        (summary.keyPoints && summary.keyPoints.length > 0) ||
        (summary.decisions && summary.decisions.length > 0) ||
        (summary.openQuestions && summary.openQuestions.length > 0)
      )
    );

    if (!hasTranscript && !hasSummary) {
      setError('Kein Inhalt zum Herunterladen vorhanden');
      return;
    }

    // Use getMeetingContent for consistent output
    const content = getMeetingContent();

    // Use Tauri save dialog
    const defaultFilename = `meeting-${currentMeeting.title.toLowerCase().replace(/\s+/g, '-')}.md`;

    try {
      const filePath = await save({
        title: 'Meeting exportieren',
        defaultPath: defaultFilename,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });

      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern der Datei');
    }
  }, [currentMeeting, setError, getMeetingContent]);

  // Auto-scroll agent chat to bottom when new messages arrive
  useEffect(() => {
    if (agentChatEndRef.current) {
      agentChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentMessages, currentAgentStreamingContent]);

  // Handle sending agent message
  const handleSendAgentMessage = useCallback(async (messageContent?: string) => {
    const content = messageContent || agentInput.trim();
    if (!content || !currentMeeting || isAgentStreaming) return;

    // Clear input
    setAgentInput('');

    // Add user message
    const userMessage: AgentMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
      context: { meetingId: currentMeeting.id },
    };
    setAgentMessages(prev => [...prev, userMessage]);

    // Start streaming
    setIsAgentStreaming(true);
    setCurrentAgentStreamingContent('');

    // Create abort controller
    const abortController = new AbortController();
    agentAbortControllerRef.current = abortController;

    try {
      let fullResponse = '';

      await streamAgentResponse(
        {
          messages: [...agentMessages, userMessage],
          meeting: currentMeeting,
          tasks: meetingTasks,
          settings,
          projectContext,
          relatedMeetings, // Improvement 3: Meeting history for project context
          signal: abortController.signal,
          onCompleteTask: async (taskId) => {
            await setTaskStatus(taskId, 'completed');
            setMeetingTasks(prev => prev.map(t =>
              t.id === taskId ? { ...t, status: 'completed', completedAt: new Date() } : t
            ));
          },
          onUpdateTaskNotes: async (taskId, notes) => {
            await updateTaskNotes(taskId, notes);
            setMeetingTasks(prev => prev.map(t =>
              t.id === taskId ? { ...t, notes } : t
            ));
          },
          onAnswerQuestion: async (questionId, answer) => {
            await updateQuestionAnswer(currentMeeting.id, questionId, answer);
          },
          onMarkQuestionAnswered: async (questionId) => {
            await handleMarkQuestionAnswered(questionId);
          },
          onAddDecision: async (text, assigneeName) => {
            if (!currentMeeting.summary) return;
            const newDecisionItem = {
              id: `decision-${Date.now()}`,
              text,
              timestamp: Date.now(),
              participants: [],
              status: 'decided' as const,
              assigneeName,
            };
            await setSummary(currentMeeting.id, {
              ...currentMeeting.summary,
              decisions: [...(currentMeeting.summary.decisions || []), newDecisionItem],
            });
          },
          onReadProjectFile: async (filePath) => {
            if (!projectContext) return '';
            try {
              const fullPath = await join(projectContext.rootPath, filePath);
              if (!(await exists(fullPath))) return '';
              return await readTextFile(fullPath);
            } catch {
              return '';
            }
          },
          onSearchProjectContent: async (query, filePattern, maxResults = 10): Promise<ContentSearchResult[]> => {
            if (!projectContext) return [];
            try {
              const results: ContentSearchResult[] = [];
              const searchRegex = new RegExp(query, 'gi');

              // Filter files by pattern if provided
              let filesToSearch = projectContext.files.filter(f => f.type === 'code' || f.type === 'doc');
              if (filePattern) {
                // Simple glob-to-regex conversion
                const patternRegex = new RegExp(
                  filePattern
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.'),
                  'i'
                );
                filesToSearch = filesToSearch.filter(f => patternRegex.test(f.name) || patternRegex.test(f.path));
              }

              // Search through files
              for (const file of filesToSearch.slice(0, 50)) { // Limit to 50 files
                if (results.length >= maxResults) break;

                try {
                  const fullPath = await join(projectContext.rootPath, file.path);
                  const content = await readTextFile(fullPath);
                  const lines = content.split('\n');

                  for (let i = 0; i < lines.length; i++) {
                    if (results.length >= maxResults) break;
                    if (searchRegex.test(lines[i])) {
                      // Get context (1 line before and after)
                      const contextLines: string[] = [];
                      if (i > 0) contextLines.push(`${i}: ${lines[i - 1]}`);
                      contextLines.push(`${i + 1}: ${lines[i]}`);
                      if (i < lines.length - 1) contextLines.push(`${i + 2}: ${lines[i + 1]}`);

                      results.push({
                        filePath: file.path,
                        lineNumber: i + 1,
                        lineContent: lines[i].trim(),
                        context: contextLines.join('\n'),
                      });
                    }
                  }
                } catch {
                  // Skip files that can't be read
                }
              }

              return results;
            } catch {
              return [];
            }
          },
          onWebSearch: async (query) => {
            const results = await webSearchManager.search(query);
            return results;
          },
        },
        (chunk) => {
          fullResponse += chunk;
          setCurrentAgentStreamingContent(fullResponse);
        },
        (toolCall) => {
          console.log('Tool call:', toolCall.name, toolCall.arguments);
        }
      );

      // Add assistant message
      const assistantMessage: AgentMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
        context: { meetingId: currentMeeting.id },
      };
      setAgentMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      if (err instanceof Error && err.message !== 'Anfrage wurde abgebrochen') {
        setError(`KI-Fehler: ${err.message}`);
      }
    } finally {
      setIsAgentStreaming(false);
      setCurrentAgentStreamingContent('');
      agentAbortControllerRef.current = null;
    }
  }, [
    agentInput,
    agentMessages,
    currentMeeting,
    meetingTasks,
    settings,
    projectContext,
    relatedMeetings,
    isAgentStreaming,
    setTaskStatus,
    updateTaskNotes,
    updateQuestionAnswer,
    handleMarkQuestionAnswered,
    setSummary,
    setError,
  ]);

  // Handle canceling agent streaming
  const handleCancelAgentStream = useCallback(() => {
    if (agentAbortControllerRef.current) {
      agentAbortControllerRef.current.abort();
    }
  }, []);

  // Handle quick action click - now with context awareness
  const handleQuickAction = useCallback((actionId: string, basePrompt: string) => {
    let prompt = basePrompt;

    if (selectedContextItem) {
      prompt += `"${selectedContextItem.title}"`;

      // Füge Details hinzu basierend auf Typ
      if (selectedContextItem.type === 'task') {
        const task = selectedContextItem.data as Task;
        if (task.notes) prompt += `\n\nNotizen zur Aufgabe: ${task.notes}`;
        if (task.description) prompt += `\n\nBeschreibung: ${task.description}`;
        if (task.assigneeName) prompt += `\n\nZugewiesen an: ${task.assigneeName}`;
      } else if (selectedContextItem.type === 'question') {
        const question = selectedContextItem.data as MeetingQuestion;
        if (question.context) prompt += `\n\nKontext: ${question.context}`;
        if (question.assigneeName) prompt += `\n\nZugewiesen an: ${question.assigneeName}`;
      } else if (selectedContextItem.type === 'decision') {
        const decision = selectedContextItem.data as MeetingDecision;
        if (decision.context) prompt += `\n\nKontext: ${decision.context}`;
        if (decision.suggestedAction) prompt += `\n\nVorgeschlagene Aktion: ${decision.suggestedAction}`;
      }
    }

    handleSendAgentMessage(prompt);
  }, [handleSendAgentMessage, selectedContextItem]);

  const isProcessing =
    recordingState === 'transcribing' || recordingState === 'enriching';

  // Fix 3: Show error message if meeting not found
  if (meetingNotFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-error" />
          <h2 className="mt-4 text-xl font-semibold text-foreground">Meeting nicht gefunden</h2>
          <p className="mt-2 text-sm text-foreground-secondary">
            Das angeforderte Meeting existiert nicht oder wurde gelöscht.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  if (!meetingId || !currentMeeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-foreground-secondary">Lade Meeting...</p>
        </div>
      </div>
    );
  }

  // Fix 8: Check if there's content for copy/download buttons
  const hasTranscriptContent = currentMeeting.transcript?.fullText && currentMeeting.transcript.fullText.trim() !== '';
  const hasSummaryContent = Boolean(
    currentMeeting.summary && (
      (currentMeeting.summary.overview && currentMeeting.summary.overview.trim() !== '') ||
      (currentMeeting.summary.keyPoints && currentMeeting.summary.keyPoints.length > 0) ||
      (currentMeeting.summary.decisions && currentMeeting.summary.decisions.length > 0) ||
      (currentMeeting.summary.openQuestions && currentMeeting.summary.openQuestions.length > 0)
    )
  );
  const hasExportableContent = hasTranscriptContent || hasSummaryContent;

  const duration =
    currentMeeting.startedAt && currentMeeting.endedAt
      ? Math.round(
          (new Date(currentMeeting.endedAt).getTime() - new Date(currentMeeting.startedAt).getTime()) / 60000
        )
      : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-foreground/5 bg-background/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setEditTitle(currentMeeting.title);
                      setIsEditing(false);
                    }
                  }}
                  className="text-xl font-semibold bg-transparent border-b-2 border-primary outline-none text-foreground"
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  className="p-1 text-success hover:bg-success/10 rounded"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    setEditTitle(currentMeeting.title);
                    setIsEditing(false);
                  }}
                  className="p-1 text-error hover:bg-error/10 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-foreground">{currentMeeting.title}</h1>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-foreground-secondary hover:text-foreground hover:bg-foreground/5 rounded"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <StatusBadge status={currentMeeting.status} />
              </div>
            )}

            <div className="mt-2 flex items-center gap-4 text-sm text-foreground-secondary">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {format(new Date(currentMeeting.createdAt), 'dd. MMM yyyy, HH:mm', { locale: de })}
              </span>
              {duration !== null && (
                <span className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  {duration} Min.
                </span>
              )}
              {currentMeeting.participantIds.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {currentMeeting.participantIds.length} Teilnehmer
                </span>
              )}
              {currentMeeting.taskIds.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  {currentMeeting.taskIds.length} Tasks
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(getMeetingContent())}
              disabled={!hasExportableContent}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                hasExportableContent
                  ? 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10 hover:text-foreground'
                  : 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
              }`}
              title={hasExportableContent ? 'Meeting-Daten kopieren' : 'Kein Inhalt zum Kopieren'}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
            <button
              onClick={downloadMarkdown}
              disabled={!hasExportableContent}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                hasExportableContent
                  ? 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10 hover:text-foreground'
                  : 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
              }`}
              title={hasExportableContent ? 'Als Markdown exportieren' : 'Kein Inhalt zum Exportieren'}
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-6 mt-4 flex items-start gap-3 rounded-lg bg-error/10 p-4 text-error"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="flex-1 text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-error/60 hover:text-error">
              x
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="p-6">
        <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as 'meeting' | 'actions' | 'ai')}>
          {/* Tab Navigation */}
          <Tabs.List className="relative mb-6 flex rounded-lg border border-foreground/5 bg-background-secondary/50 p-1">
            {/* Animated Background */}
            <motion.div
              className="absolute inset-1 z-0 rounded-md bg-primary"
              layoutId="roomActiveTab"
              style={{
                width: 'calc(33.333% - 4px)',
                left: activeTab === 'meeting'
                  ? 'calc(0% + 2px)'
                  : activeTab === 'actions'
                  ? 'calc(33.333% + 2px)'
                  : 'calc(66.666% + 2px)',
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
              }}
            />
            <Tabs.Trigger
              value="meeting"
              className={`
                relative z-10 flex flex-1 items-center justify-center gap-2
                rounded-md px-4 py-2.5 text-sm font-medium transition-colors
                ${activeTab === 'meeting' ? 'text-white' : 'text-foreground-secondary hover:text-foreground'}
              `}
            >
              <Users className="h-4 w-4" />
              Meeting
            </Tabs.Trigger>
            <Tabs.Trigger
              value="actions"
              className={`
                relative z-10 flex flex-1 items-center justify-center gap-2
                rounded-md px-4 py-2.5 text-sm font-medium transition-colors
                ${activeTab === 'actions' ? 'text-white' : 'text-foreground-secondary hover:text-foreground'}
              `}
            >
              <ClipboardList className="h-4 w-4" />
              Aktionen
              {(meetingTasks.filter(t => t.status !== 'completed').length > 0 ||
                (currentMeeting.summary?.openQuestions?.filter(q => !q.answered).length ?? 0) > 0) && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                  {meetingTasks.filter(t => t.status !== 'completed').length +
                    (currentMeeting.summary?.openQuestions?.filter(q => !q.answered).length ?? 0)}
                </span>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="ai"
              className={`
                relative z-10 flex flex-1 items-center justify-center gap-2
                rounded-md px-4 py-2.5 text-sm font-medium transition-colors
                ${activeTab === 'ai' ? 'text-white' : 'text-foreground-secondary hover:text-foreground'}
              `}
            >
              <Bot className="h-4 w-4" />
              KI Fragen
              {agentMessages.length > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                  {agentMessages.length}
                </span>
              )}
            </Tabs.Trigger>
          </Tabs.List>

          {/* Meeting Tab Content */}
          <Tabs.Content value="meeting" className="outline-none">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main content - Transcript & Summary */}
          <div className="space-y-6 lg:col-span-2">
            {/* Follow-up Recording Section */}
            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium text-foreground">Follow-up Aufnahme</h2>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Füge eine neue Aufnahme zu diesem Meeting hinzu
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <AnimatedOrb
                    state={recordingState}
                    audioLevel={audioLevel}
                    onClick={handleFollowUpRecording}
                    disabled={isProcessing || !settings.openaiApiKey}
                    size="sm"
                  />
                </div>
              </div>

              {/* Show streaming content during processing */}
              {(isStreaming || enrichedContent) && recordingState !== 'idle' && (
                <div className="mt-4 border-t border-foreground/5 pt-4">
                  <StreamingText content={enrichedContent} isStreaming={isStreaming} />
                </div>
              )}
            </GlassCard>

            {/* Transcript Section */}
            <CollapsibleSection
              title="Transkript"
              icon={MessageSquare}
              defaultOpen={true}
            >
              {currentMeeting.transcript ? (
                <div className="space-y-4">
                  {/* Deduplicate segments by ID to prevent React key errors */}
                  {currentMeeting.transcript.segments
                    .filter((segment, index, self) =>
                      index === self.findIndex(s => s.id === segment.id)
                    )
                    .map((segment, index) => (
                    <div
                      key={segment.id || `segment-${index}`}
                      className="rounded-lg bg-background p-3"
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-foreground-secondary">
                        <span>
                          {formatAbsoluteTimestamp(new Date(currentMeeting.createdAt), segment.startTime)}
                        </span>
                        {segment.speakerId && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                            {segment.speakerId}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground">{segment.text}</p>
                    </div>
                  ))}

                  {/* Full text fallback if no segments */}
                  {currentMeeting.transcript.segments.length === 0 && currentMeeting.transcript.fullText && (
                    <p className="text-sm text-foreground leading-relaxed">
                      {currentMeeting.transcript.fullText}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  Noch kein Transkript vorhanden. Starte eine Aufnahme, um das Meeting zu transkribieren.
                </p>
              )}
            </CollapsibleSection>

            {/* Summary Section */}
            <CollapsibleSection
              title="Zusammenfassung"
              icon={Lightbulb}
              defaultOpen={true}
            >
              {currentMeeting.summary ? (
                <div className="prose prose-sm max-w-none">
                  <div className="markdown-content text-sm text-foreground">
                    <StreamingText content={currentMeeting.summary.overview} isStreaming={false} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  Noch keine Zusammenfassung vorhanden. Nach der Transkription wird automatisch eine Zusammenfassung erstellt.
                </p>
              )}
            </CollapsibleSection>
          </div>

          {/* Sidebar - Context Panel */}
          <div className="space-y-6">
            {/* Export-Ordner Section */}
            <CollapsibleSection
              title="Export-Ordner"
              icon={FileCode2}
              defaultOpen={true}
            >
              {projectPath ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <FileCode2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {projectContext?.name || projectPath.split('/').pop()}
                      </p>
                      <p className="text-xs text-foreground-secondary truncate">
                        {projectPath}
                      </p>
                      {projectContext && (
                        <p className="text-xs text-emerald-500">
                          {projectContext.totalFiles} Dateien
                        </p>
                      )}
                      {isIndexing && (
                        <div className="space-y-1.5 mt-1">
                          {/* Indeterminate Progress Bar */}
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full w-1/3 bg-primary rounded-full"
                              style={{
                                animation: 'indeterminate 1.5s ease-in-out infinite',
                              }}
                            />
                          </div>
                          {/* Phase Text */}
                          <p className="text-xs text-primary flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            {indexPhase || 'Indexiere...'}
                          </p>
                        </div>
                      )}
                      {indexError && (
                        <p className="text-xs text-error">
                          {indexError}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportMeeting}
                      disabled={isExporting}
                      className="flex-1 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {isExporting ? 'Exportiere...' : 'Jetzt exportieren'}
                    </button>
                    <button
                      onClick={handleRemoveProject}
                      className="text-xs px-2 py-1 rounded bg-error/10 text-error hover:bg-error/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : showProjectDropdown ? (
                <div className="space-y-2">
                  {/* Recent Projects Dropdown */}
                  {(settings.recentProjects?.length ?? 0) > 0 && !showPathInput && (
                    <div className="space-y-1">
                      <p className="text-xs text-foreground-secondary mb-2">Letzte Export-Ordner:</p>
                      {(settings.recentProjects ?? []).map((path) => (
                        <button
                          key={path}
                          onClick={() => handleSelectRecentProject(path)}
                          className="w-full text-left px-3 py-2 text-sm bg-background border border-foreground/10 rounded-lg hover:bg-foreground/5 hover:border-emerald-500/30 transition-colors"
                        >
                          <span className="font-medium truncate block">
                            {path.split('/').pop()}
                          </span>
                          <span className="text-xs text-foreground-secondary truncate block">
                            {path}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Manual Path Input */}
                  {showPathInput ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={manualPath}
                        onChange={(e) => setManualPath(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleManualPathSubmit();
                          if (e.key === 'Escape') {
                            setShowPathInput(false);
                            setManualPath('');
                          }
                        }}
                        placeholder="/Users/.../projekt-ordner"
                        className="w-full px-3 py-2 text-sm bg-background border border-foreground/10 rounded-lg focus:outline-none focus:border-primary"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleManualPathSubmit}
                          disabled={!manualPath.trim()}
                          className="flex-1 py-1.5 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Verbinden
                        </button>
                        <button
                          onClick={() => { setShowPathInput(false); setManualPath(''); }}
                          className="px-3 py-1.5 text-xs bg-foreground/5 rounded hover:bg-foreground/10"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPathInput(true)}
                      className="w-full text-center py-2 text-xs text-foreground-secondary hover:text-foreground border border-dashed border-foreground/10 rounded-lg hover:border-foreground/20"
                    >
                      Anderen Ordner...
                    </button>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={() => { setShowProjectDropdown(false); setShowPathInput(false); setManualPath(''); }}
                    className="w-full py-1.5 text-xs text-foreground-secondary hover:text-foreground"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSelectProjectFolder}
                  className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-foreground/10 rounded-lg text-sm text-foreground-secondary hover:border-emerald-500/30 hover:bg-emerald-500/5"
                >
                  <FolderOpen className="h-4 w-4" />
                  Export-Ordner wählen
                </button>
              )}
            </CollapsibleSection>

            {/* Participants */}
            <CollapsibleSection
              title="Teilnehmer"
              icon={Users}
              badge={meetingParticipants.length}
              defaultOpen={true}
            >
              {meetingParticipants.length > 0 ? (
                <div className="space-y-2">
                  {meetingParticipants.map(participant => (
                    <div
                      key={participant.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-background p-2"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: participant.color }}
                        />
                        <span className="text-sm text-foreground">{participant.name}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveParticipant(participant.id)}
                        className="p-1 text-foreground-secondary hover:text-error hover:bg-error/10 rounded"
                        title="Entfernen"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  Keine Teilnehmer hinzugefügt.
                </p>
              )}

              {/* Add participant button/dropdown */}
              {showAddParticipant ? (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <div className="flex items-center gap-1.5 rounded bg-background px-2 py-1.5">
                      <Search className="h-3 w-3 text-foreground-secondary" />
                      <input
                        type="text"
                        value={participantSearch}
                        onChange={(e) => setParticipantSearch(e.target.value)}
                        placeholder="Teilnehmer suchen..."
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none"
                        autoFocus
                      />
                    </div>

                    {/* Dropdown */}
                    <div className="mt-1 max-h-32 overflow-y-auto rounded border border-foreground/10 bg-background">
                      {availableSpeakers.length > 0 ? (
                        availableSpeakers.map(speaker => (
                          <button
                            key={speaker.id}
                            onClick={() => handleAddParticipant(speaker.id)}
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-foreground/5"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: speaker.color }}
                            />
                            <span className="text-foreground">{speaker.name}</span>
                          </button>
                        ))
                      ) : participantSearch && !isCreatingParticipant ? (
                        <div className="px-2 py-1.5 text-xs text-foreground-secondary">
                          Keine Sprecher gefunden
                        </div>
                      ) : null}

                      {/* Create new */}
                      <div className="border-t border-foreground/10">
                        {isCreatingParticipant ? (
                          <div className="flex items-center gap-1 p-1.5">
                            <input
                              type="text"
                              value={newParticipantName}
                              onChange={(e) => setNewParticipantName(e.target.value)}
                              placeholder="Name eingeben..."
                              className="flex-1 rounded bg-foreground/5 px-2 py-1 text-xs text-foreground focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCreateParticipant();
                                }
                                if (e.key === 'Escape') {
                                  setIsCreatingParticipant(false);
                                  setNewParticipantName('');
                                }
                              }}
                            />
                            <button
                              onClick={handleCreateParticipant}
                              disabled={!newParticipantName.trim()}
                              className="flex h-5 w-5 items-center justify-center rounded bg-primary text-white disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setIsCreatingParticipant(true);
                              setNewParticipantName(participantSearch);
                            }}
                            className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/5"
                          >
                            <Plus className="h-3 w-3" />
                            {participantSearch ? `"${participantSearch}" anlegen` : 'Neuen Teilnehmer anlegen'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowAddParticipant(false);
                      setParticipantSearch('');
                      setIsCreatingParticipant(false);
                      setNewParticipantName('');
                    }}
                    className="w-full py-1 text-xs text-foreground-secondary hover:text-foreground"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddParticipant(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/10 py-2 text-xs text-foreground-secondary hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <UserPlus className="h-3 w-3" />
                  Teilnehmer hinzufügen
                </button>
              )}
            </CollapsibleSection>

            {/* Recordings */}
            <CollapsibleSection
              title="Aufnahmen"
              icon={Mic}
              badge={meetingRecordings.length}
              defaultOpen={true}
            >
              {meetingRecordings.length > 0 ? (
                <div className="space-y-4">
                  {[...meetingRecordings]
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .map((recording, index) => (
                      <AudioPlayerCompact
                        key={recording.id}
                        recording={recording}
                        index={index}
                        onDelete={() => handleDeleteRecording(recording.id)}
                      />
                    ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  Keine Aufnahmen vorhanden. Starte eine Aufnahme, um Audio zu speichern.
                </p>
              )}
            </CollapsibleSection>

            {/* Decisions */}
            <CollapsibleSection
              title="Entscheidungen"
              icon={CheckCircle2}
              badge={currentMeeting.summary?.decisions?.length}
              defaultOpen={true}
            >
              {currentMeeting.summary?.decisions && currentMeeting.summary.decisions.length > 0 ? (
                <ul className="space-y-2">
                  {currentMeeting.summary.decisions.map((decision, index) => (
                    <li
                      key={decision.id || index}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                      <span>{decision.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  Keine Entscheidungen dokumentiert.
                </p>
              )}
            </CollapsibleSection>

            {/* Open Questions */}
            <CollapsibleSection
              title="Offene Fragen"
              icon={HelpCircle}
              badge={currentMeeting.summary?.openQuestions?.filter((q) => !q.answered).length}
              defaultOpen={true}
            >
              {currentMeeting.summary?.openQuestions && currentMeeting.summary.openQuestions.length > 0 ? (
                <ul className="space-y-2">
                  {currentMeeting.summary.openQuestions.map((question, index) => (
                    <li
                      key={question.id || index}
                      className={`flex items-start gap-2 text-sm ${
                        question.answered ? 'text-foreground-secondary line-through' : 'text-foreground'
                      }`}
                    >
                      <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                      <span>{question.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  Keine offenen Fragen.
                </p>
              )}
            </CollapsibleSection>

            {/* Tasks - only show non-completed tasks in Meeting tab */}
            <CollapsibleSection
              title="Aufgaben"
              icon={ListTodo}
              badge={meetingTasks.filter(t => t.status !== 'completed').length}
              defaultOpen={true}
            >
              {meetingTasks.filter(t => t.status !== 'completed').length > 0 ? (
                <div className="space-y-3">
                  {meetingTasks.filter(t => t.status !== 'completed').map((task) => (
                    <div
                      key={task.id}
                      className={`rounded-lg border bg-background p-3 transition-all ${
                        task.status === 'completed'
                          ? 'border-foreground/5 opacity-60'
                          : task.priority === 'urgent'
                          ? 'border-error/30'
                          : task.priority === 'high'
                          ? 'border-warning/30'
                          : 'border-foreground/10'
                      }`}
                    >
                      {/* Task Header */}
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => handleToggleTask(task.id, task.status)}
                          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors ${
                            task.status === 'completed'
                              ? 'bg-success text-white'
                              : 'border-2 border-foreground/30 hover:border-primary'
                          }`}
                        >
                          {task.status === 'completed' && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium leading-tight ${
                              task.status === 'completed' ? 'text-foreground-secondary line-through' : 'text-foreground'
                            }`}>
                              {task.title}
                            </p>
                            <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              task.priority === 'urgent'
                                ? 'bg-error/20 text-error'
                                : task.priority === 'high'
                                ? 'bg-warning/20 text-warning'
                                : task.priority === 'medium'
                                ? 'bg-primary/20 text-primary'
                                : 'bg-foreground/10 text-foreground-secondary'
                            }`}>
                              {task.priority === 'urgent' ? 'Dringend' :
                               task.priority === 'high' ? 'Hoch' :
                               task.priority === 'medium' ? 'Mittel' : 'Niedrig'}
                            </span>
                          </div>
                          {/* Metadata line */}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-foreground-secondary">
                            {/* Clickable Assignee Selector */}
                            <div className="relative">
                              <button
                                onClick={() => setEditingTaskAssignee(
                                  editingTaskAssignee === task.id ? null : task.id
                                )}
                                className="flex items-center gap-0.5 text-[10px] hover:text-foreground transition-colors"
                              >
                                <Users className="h-2.5 w-2.5" />
                                {task.assigneeName ? (
                                  <span className="text-primary">@{task.assigneeName}</span>
                                ) : (
                                  <span className="text-foreground-secondary/70 hover:text-foreground-secondary">Zuweisen...</span>
                                )}
                              </button>
                              {editingTaskAssignee === task.id && (
                                <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-44 overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                                  <button
                                    onClick={() => handleUpdateTaskAssignee(task.id, undefined)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground-secondary hover:bg-foreground/5"
                                  >
                                    <X className="h-3 w-3" />
                                    Kein Verantwortlicher
                                  </button>
                                  {meetingParticipants.map((participant) => (
                                    <button
                                      key={participant.id}
                                      onClick={() => handleUpdateTaskAssignee(task.id, participant.name)}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-foreground/5"
                                    >
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: participant.color }}
                                      />
                                      {participant.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {format(new Date(task.createdAt), 'dd.MM.yyyy', { locale: de })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Notes Section */}
                      <div className="mt-2 border-t border-foreground/5 pt-2">
                        {editingTaskNotes === task.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={taskNotesValue}
                              onChange={(e) => setTaskNotesValue(e.target.value)}
                              placeholder="Notiz hinzufügen..."
                              className="w-full rounded-lg border border-foreground/10 bg-background-secondary px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-secondary/50 focus:border-primary focus:outline-none"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingTaskNotes(null);
                                  setTaskNotesValue('');
                                }}
                                className="rounded px-2 py-1 text-[10px] text-foreground-secondary hover:bg-foreground/5"
                              >
                                Abbrechen
                              </button>
                              <button
                                onClick={() => handleSaveTaskNotes(task.id)}
                                className="rounded bg-primary px-2 py-1 text-[10px] text-white hover:bg-primary/90"
                              >
                                Speichern
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingTaskNotes(task.id);
                              setTaskNotesValue(task.notes || '');
                            }}
                            className="flex cursor-pointer items-start gap-1.5 rounded border border-dashed border-foreground/10 p-1.5 text-xs text-foreground-secondary hover:border-foreground/20 hover:bg-foreground/5"
                          >
                            <Pencil className="mt-0.5 h-2.5 w-2.5 flex-shrink-0" />
                            <span className={`flex-1 ${task.notes ? 'text-foreground' : ''}`}>
                              {task.notes || 'Notiz hinzufügen...'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddTaskAttachment(task.id);
                              }}
                              className="rounded p-0.5 text-foreground-secondary hover:bg-foreground/10 hover:text-foreground"
                              title="Datei anhängen"
                            >
                              <Paperclip className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Attachments */}
                        {task.attachments && task.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {task.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px]"
                              >
                                <Paperclip className="h-2.5 w-2.5 text-foreground-secondary" />
                                <span className="max-w-[100px] truncate text-foreground">
                                  {attachment.name}
                                </span>
                                <button
                                  onClick={() => handleOpenFile(attachment.path)}
                                  className="rounded-full p-0.5 text-primary hover:bg-primary/10"
                                  title="Datei öffnen"
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  onClick={() => handleRemoveTaskAttachment(task.id, attachment.id)}
                                  className="rounded-full p-0.5 text-foreground-secondary hover:bg-foreground/10 hover:text-error"
                                  title="Anhang entfernen"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-secondary">
                  {meetingTasks.length > 0 ? 'Alle Aufgaben erledigt!' : 'Keine Aufgaben erstellt.'}
                </p>
              )}
            </CollapsibleSection>

            {/* Key Points */}
            {currentMeeting.summary?.keyPoints && currentMeeting.summary.keyPoints.length > 0 && (
              <CollapsibleSection
                title="Kernpunkte"
                icon={Lightbulb}
                badge={currentMeeting.summary.keyPoints.length}
                defaultOpen={false}
              >
                <ul className="space-y-2">
                  {currentMeeting.summary.keyPoints.map((point, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                        {index + 1}
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}
          </div>
            </div>
          </Tabs.Content>

          {/* Actions Tab Content */}
          <Tabs.Content value="actions" className="outline-none">
            {/* Sub-Tab Navigation */}
            <div className="mb-6 flex flex-wrap gap-2 rounded-lg border border-foreground/5 bg-background-secondary/50 p-2">
              <button
                onClick={() => setActionsSubTab('tasks')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  actionsSubTab === 'tasks'
                    ? 'bg-primary text-white'
                    : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
                }`}
              >
                <ListTodo className="h-4 w-4" />
                Aufgaben
                {meetingTasks.filter(t => t.status !== 'completed').length > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    actionsSubTab === 'tasks' ? 'bg-white/20' : 'bg-primary/20 text-primary'
                  }`}>
                    {meetingTasks.filter(t => t.status !== 'completed').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActionsSubTab('completed')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  actionsSubTab === 'completed'
                    ? 'bg-primary text-white'
                    : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
                }`}
              >
                <Check className="h-4 w-4" />
                Erledigt
                {meetingTasks.filter(t => t.status === 'completed').length > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    actionsSubTab === 'completed' ? 'bg-white/20' : 'bg-success/20 text-success'
                  }`}>
                    {meetingTasks.filter(t => t.status === 'completed').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActionsSubTab('decisions')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  actionsSubTab === 'decisions'
                    ? 'bg-primary text-white'
                    : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                Entscheidungen
                {(currentMeeting.summary?.decisions?.length ?? 0) > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    actionsSubTab === 'decisions' ? 'bg-white/20' : 'bg-success/20 text-success'
                  }`}>
                    {currentMeeting.summary?.decisions?.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActionsSubTab('questions')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  actionsSubTab === 'questions'
                    ? 'bg-primary text-white'
                    : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
                }`}
              >
                <HelpCircle className="h-4 w-4" />
                Offene Fragen
                {(currentMeeting.summary?.openQuestions?.filter(q => !q.answered).length ?? 0) > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    actionsSubTab === 'questions' ? 'bg-white/20' : 'bg-warning/20 text-warning'
                  }`}>
                    {currentMeeting.summary?.openQuestions?.filter(q => !q.answered).length}
                  </span>
                )}
              </button>
            </div>

            {/* Sub-Tab Content */}
            <div className="space-y-6">
              {/* Tasks Sub-Tab */}
              {actionsSubTab === 'tasks' && (
              <div className="rounded-lg border border-foreground/5 bg-background-secondary/50">
                <div className="flex items-center justify-between border-b border-foreground/5 p-4">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Offene Aufgaben</h2>
                  </div>
                  {/* Sort Toggle */}
                  <button
                    onClick={() => setTaskSortBy(taskSortBy === 'priority' ? 'date' : 'priority')}
                    className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-2.5 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/10 hover:text-foreground"
                  >
                    <SortDesc className="h-3.5 w-3.5" />
                    {taskSortBy === 'priority' ? 'Priorität' : 'Datum'}
                  </button>
                </div>

                <div className="p-4">
                  {sortedTasks.filter(t => t.status !== 'completed').length > 0 ? (
                    <div className="space-y-3">
                      {sortedTasks.filter(t => t.status !== 'completed').map((task) => (
                        <div
                          key={task.id}
                          className={`rounded-lg border bg-background transition-all ${
                            task.priority === 'urgent'
                              ? 'border-error/30'
                              : task.priority === 'high'
                              ? 'border-warning/30'
                              : 'border-foreground/10'
                          }`}
                        >
                          {/* Task Header */}
                          <div className="flex items-start gap-3 p-4">
                            <button
                              onClick={() => handleToggleTask(task.id, task.status)}
                              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition-colors ${
                                task.status === 'completed'
                                  ? 'bg-success text-white'
                                  : 'border-2 border-foreground/30 hover:border-primary'
                              }`}
                            >
                              {task.status === 'completed' && <Check className="h-3 w-3" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-medium ${
                                  task.status === 'completed' ? 'text-foreground-secondary line-through' : 'text-foreground'
                                }`}>
                                  {task.title}
                                </p>
                                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  task.priority === 'urgent'
                                    ? 'bg-error/20 text-error'
                                    : task.priority === 'high'
                                    ? 'bg-warning/20 text-warning'
                                    : task.priority === 'medium'
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-foreground/10 text-foreground-secondary'
                                }`}>
                                  {task.priority === 'urgent' ? '🔴 Dringend' :
                                   task.priority === 'high' ? '🟠 Hoch' :
                                   task.priority === 'medium' ? '🟡 Mittel' : '🟢 Niedrig'}
                                </span>
                              </div>
                              {/* Metadata line */}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                                {/* Clickable Assignee Selector */}
                                <div className="relative">
                                  <button
                                    onClick={() => setEditingTaskAssignee(
                                      editingTaskAssignee === task.id ? null : task.id
                                    )}
                                    className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                                  >
                                    <Users className="h-3 w-3" />
                                    {task.assigneeName ? (
                                      <span className="text-primary">@{task.assigneeName}</span>
                                    ) : (
                                      <span className="text-foreground-secondary/70 hover:text-foreground-secondary">Zuweisen...</span>
                                    )}
                                  </button>
                                  {editingTaskAssignee === task.id && (
                                    <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                                      <button
                                        onClick={() => handleUpdateTaskAssignee(task.id, undefined)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-foreground/5"
                                      >
                                        <X className="h-3 w-3" />
                                        Kein Verantwortlicher
                                      </button>
                                      {meetingParticipants.map((participant) => (
                                        <button
                                          key={participant.id}
                                          onClick={() => handleUpdateTaskAssignee(task.id, participant.name)}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: participant.color }}
                                          />
                                          {participant.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Erstellt: {format(new Date(task.createdAt), 'dd.MM.yyyy', { locale: de })}
                                </span>
                                {task.status === 'completed' && task.completedAt && (
                                  <span className="flex items-center gap-1 text-success">
                                    <Check className="h-3 w-3" />
                                    Erledigt: {format(new Date(task.completedAt), 'dd.MM.yyyy', { locale: de })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Notes Section */}
                          <div className="border-t border-foreground/5 px-4 py-3">
                            {editingTaskNotes === task.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={taskNotesValue}
                                  onChange={(e) => setTaskNotesValue(e.target.value)}
                                  placeholder="Notiz hinzufügen..."
                                  className="w-full rounded-lg border border-foreground/10 bg-background-secondary px-3 py-2 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:border-primary focus:outline-none"
                                  rows={3}
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingTaskNotes(null);
                                      setTaskNotesValue('');
                                    }}
                                    className="rounded-lg px-3 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/5"
                                  >
                                    Abbrechen
                                  </button>
                                  <button
                                    onClick={() => handleSaveTaskNotes(task.id)}
                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
                                  >
                                    Speichern
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingTaskNotes(task.id);
                                  setTaskNotesValue(task.notes || '');
                                }}
                                className="flex cursor-pointer items-start gap-2 rounded-lg border border-dashed border-foreground/10 p-2 text-sm text-foreground-secondary hover:border-foreground/20 hover:bg-foreground/5"
                              >
                                <Pencil className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                <span className={task.notes ? 'text-foreground' : ''}>
                                  {task.notes || 'Notiz hinzufügen...'}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddTaskAttachment(task.id);
                                  }}
                                  className="ml-auto rounded p-1 text-foreground-secondary hover:bg-foreground/10 hover:text-foreground"
                                  title="Datei anhängen"
                                >
                                  <Paperclip className="h-4 w-4" />
                                </button>
                              </div>
                            )}

                            {/* Attachments */}
                            {task.attachments && task.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {task.attachments.map((attachment) => (
                                  <div
                                    key={attachment.id}
                                    className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-xs"
                                  >
                                    <Paperclip className="h-3 w-3 text-foreground-secondary" />
                                    <span className="max-w-[150px] truncate text-foreground">
                                      {attachment.name}
                                    </span>
                                    <button
                                      onClick={() => handleOpenFile(attachment.path)}
                                      className="rounded-full p-0.5 text-primary hover:bg-primary/10"
                                      title="Datei öffnen"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => handleRemoveTaskAttachment(task.id, attachment.id)}
                                      className="ml-1 rounded-full p-0.5 text-foreground-secondary hover:bg-foreground/10 hover:text-error"
                                      title="Anhang entfernen"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-secondary">
                      Keine offenen Aufgaben. Aufgaben werden automatisch aus dem Transkript extrahiert.
                    </p>
                  )}
                </div>
              </div>
              )}

              {/* Completed Tasks Sub-Tab */}
              {actionsSubTab === 'completed' && (
              <div className="rounded-lg border border-foreground/5 bg-background-secondary/50">
                <div className="flex items-center justify-between border-b border-foreground/5 p-4">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-success" />
                    <h2 className="text-lg font-semibold text-foreground">Erledigte Aufgaben</h2>
                  </div>
                  {/* Sort Toggle */}
                  <button
                    onClick={() => setTaskSortBy(taskSortBy === 'priority' ? 'date' : 'priority')}
                    className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-2.5 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/10 hover:text-foreground"
                  >
                    <SortDesc className="h-3.5 w-3.5" />
                    {taskSortBy === 'priority' ? 'Priorität' : 'Datum'}
                  </button>
                </div>

                <div className="p-4">
                  {sortedTasks.filter(t => t.status === 'completed').length > 0 ? (
                    <div className="space-y-3">
                      {sortedTasks.filter(t => t.status === 'completed').map((task) => (
                        <div
                          key={task.id}
                          className="rounded-lg border border-foreground/5 bg-background opacity-70 transition-all"
                        >
                          {/* Task Header */}
                          <div className="flex items-start gap-3 p-4">
                            <button
                              onClick={() => handleToggleTask(task.id, task.status)}
                              className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-success text-white transition-colors"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-foreground-secondary line-through">
                                  {task.title}
                                </p>
                                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  task.priority === 'urgent'
                                    ? 'bg-error/20 text-error'
                                    : task.priority === 'high'
                                    ? 'bg-warning/20 text-warning'
                                    : task.priority === 'medium'
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-foreground/10 text-foreground-secondary'
                                }`}>
                                  {task.priority === 'urgent' ? '🔴 Dringend' :
                                   task.priority === 'high' ? '🟠 Hoch' :
                                   task.priority === 'medium' ? '🟡 Mittel' : '🟢 Niedrig'}
                                </span>
                              </div>
                              {/* Metadata line */}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                                {/* Clickable Assignee Selector */}
                                <div className="relative">
                                  <button
                                    onClick={() => setEditingTaskAssignee(
                                      editingTaskAssignee === task.id ? null : task.id
                                    )}
                                    className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                                  >
                                    <Users className="h-3 w-3" />
                                    {task.assigneeName ? (
                                      <span className="text-primary">@{task.assigneeName}</span>
                                    ) : (
                                      <span className="text-foreground-secondary/70 hover:text-foreground-secondary">Zuweisen...</span>
                                    )}
                                  </button>
                                  {editingTaskAssignee === task.id && (
                                    <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                                      <button
                                        onClick={() => handleUpdateTaskAssignee(task.id, undefined)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-foreground/5"
                                      >
                                        <X className="h-3 w-3" />
                                        Kein Verantwortlicher
                                      </button>
                                      {meetingParticipants.map((participant) => (
                                        <button
                                          key={participant.id}
                                          onClick={() => handleUpdateTaskAssignee(task.id, participant.name)}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: participant.color }}
                                          />
                                          {participant.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Erstellt: {format(new Date(task.createdAt), 'dd.MM.yyyy', { locale: de })}
                                </span>
                                {task.completedAt && (
                                  <span className="flex items-center gap-1 text-success">
                                    <Check className="h-3 w-3" />
                                    Erledigt: {format(new Date(task.completedAt), 'dd.MM.yyyy', { locale: de })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Notes display (read-only for completed tasks) */}
                          {task.notes && (
                            <div className="border-t border-foreground/5 px-4 py-3">
                              <div className="flex items-start gap-2 rounded-lg border border-dashed border-foreground/10 p-2 text-sm text-foreground-secondary">
                                <Pencil className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                <span>{task.notes}</span>
                              </div>
                            </div>
                          )}

                          {/* Attachments */}
                          {task.attachments && task.attachments.length > 0 && (
                            <div className="border-t border-foreground/5 px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                {task.attachments.map((attachment) => (
                                  <div
                                    key={attachment.id}
                                    className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-xs"
                                  >
                                    <Paperclip className="h-3 w-3 text-foreground-secondary" />
                                    <span className="max-w-[150px] truncate text-foreground">
                                      {attachment.name}
                                    </span>
                                    <button
                                      onClick={() => handleOpenFile(attachment.path)}
                                      className="rounded-full p-0.5 text-primary hover:bg-primary/10"
                                      title="Datei öffnen"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-secondary">
                      Noch keine erledigten Aufgaben.
                    </p>
                  )}
                </div>
              </div>
              )}

              {/* Decisions Sub-Tab */}
              {actionsSubTab === 'decisions' && (
              <div className="rounded-lg border border-foreground/5 bg-background-secondary/50">
                <div className="flex items-center gap-2 border-b border-foreground/5 p-4">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <h2 className="text-lg font-semibold text-foreground">Entscheidungen</h2>
                  {(currentMeeting.summary?.decisions?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
                      {currentMeeting.summary?.decisions?.length}
                    </span>
                  )}
                </div>

                <div className="p-4">
                  {/* Add Decision Form */}
                  <div className="mb-4 rounded-lg border border-dashed border-foreground/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Plus className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium text-foreground">Neue Entscheidung</span>
                    </div>
                    <textarea
                      value={newDecision}
                      onChange={(e) => setNewDecision(e.target.value)}
                      placeholder="Entscheidung eingeben..."
                      className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:border-success focus:outline-none"
                      rows={2}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <button
                          onClick={() => setShowDecisionAssigneeDropdown(!showDecisionAssigneeDropdown)}
                          className="flex w-full items-center gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground-secondary hover:border-foreground/20"
                        >
                          <Users className="h-4 w-4" />
                          {newDecisionAssigneeName || 'Verantwortlich auswählen...'}
                        </button>
                        {showDecisionAssigneeDropdown && (
                          <div className="absolute left-0 top-full z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                            <button
                              onClick={() => {
                                setNewDecisionAssigneeId(undefined);
                                setNewDecisionAssigneeName(undefined);
                                setShowDecisionAssigneeDropdown(false);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-foreground/5"
                            >
                              <X className="h-3 w-3" />
                              Kein Verantwortlicher
                            </button>
                            {meetingParticipants.map((participant) => (
                              <button
                                key={participant.id}
                                onClick={() => {
                                  setNewDecisionAssigneeId(participant.id);
                                  setNewDecisionAssigneeName(participant.name);
                                  setShowDecisionAssigneeDropdown(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: participant.color }}
                                />
                                {participant.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleAddDecision}
                        disabled={!newDecision.trim()}
                        className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hinzufügen
                      </button>
                    </div>
                  </div>

                  {currentMeeting.summary?.decisions && currentMeeting.summary.decisions.length > 0 ? (
                    <div className="space-y-3">
                      {currentMeeting.summary.decisions.map((decision, index) => (
                        <div
                          key={decision.id || index}
                          className="rounded-lg border border-foreground/10 bg-background p-4"
                        >
                          <div className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                            <div className="flex-1">
                              <p className="text-sm text-foreground">{decision.text}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                                <span>
                                  {format(new Date(decision.timestamp || currentMeeting.createdAt), 'dd.MM.yyyy', { locale: de })}
                                </span>
                                {/* Clickable Assignee Selector */}
                                <div className="relative">
                                  <button
                                    onClick={() => setEditingDecisionAssignee(
                                      editingDecisionAssignee === decision.id ? null : decision.id
                                    )}
                                    className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                                  >
                                    <Users className="h-3 w-3" />
                                    {decision.assigneeName ? (
                                      <span className="text-primary">@{decision.assigneeName}</span>
                                    ) : (
                                      <span className="text-foreground-secondary/70 hover:text-foreground-secondary">Zuweisen...</span>
                                    )}
                                  </button>
                                  {editingDecisionAssignee === decision.id && (
                                    <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                                      <button
                                        onClick={() => handleUpdateDecisionAssignee(decision.id, undefined, undefined)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-foreground/5"
                                      >
                                        <X className="h-3 w-3" />
                                        Kein Verantwortlicher
                                      </button>
                                      {meetingParticipants.map((participant) => (
                                        <button
                                          key={participant.id}
                                          onClick={() => handleUpdateDecisionAssignee(decision.id, participant.id, participant.name)}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: participant.color }}
                                          />
                                          {participant.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-secondary">
                      Keine Entscheidungen dokumentiert.
                    </p>
                  )}
                </div>
              </div>
              )}

              {/* Open Questions Sub-Tab */}
              {actionsSubTab === 'questions' && (
              <div className="rounded-lg border border-foreground/5 bg-background-secondary/50">
                <div className="flex items-center gap-2 border-b border-foreground/5 p-4">
                  <HelpCircle className="h-5 w-5 text-warning" />
                  <h2 className="text-lg font-semibold text-foreground">Offene Fragen</h2>
                  {(currentMeeting.summary?.openQuestions?.filter(q => !q.answered).length ?? 0) > 0 && (
                    <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
                      {currentMeeting.summary?.openQuestions?.filter(q => !q.answered).length} offen
                    </span>
                  )}
                </div>

                <div className="p-4">
                  {/* Add Question Form */}
                  <div className="mb-4 rounded-lg border border-dashed border-foreground/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Plus className="h-4 w-4 text-warning" />
                      <span className="text-sm font-medium text-foreground">Neue Frage</span>
                    </div>
                    <textarea
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      placeholder="Frage eingeben..."
                      className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:border-warning focus:outline-none"
                      rows={2}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <button
                          onClick={() => setShowQuestionAssigneeDropdown(!showQuestionAssigneeDropdown)}
                          className="flex w-full items-center gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground-secondary hover:border-foreground/20"
                        >
                          <Users className="h-4 w-4" />
                          {newQuestionAssigneeName || 'Verantwortlich auswählen...'}
                        </button>
                        {showQuestionAssigneeDropdown && (
                          <div className="absolute left-0 top-full z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                            <button
                              onClick={() => {
                                setNewQuestionAssigneeId(undefined);
                                setNewQuestionAssigneeName(undefined);
                                setShowQuestionAssigneeDropdown(false);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-foreground/5"
                            >
                              <X className="h-3 w-3" />
                              Kein Verantwortlicher
                            </button>
                            {meetingParticipants.map((participant) => (
                              <button
                                key={participant.id}
                                onClick={() => {
                                  setNewQuestionAssigneeId(participant.id);
                                  setNewQuestionAssigneeName(participant.name);
                                  setShowQuestionAssigneeDropdown(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: participant.color }}
                                />
                                {participant.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleAddQuestion}
                        disabled={!newQuestion.trim()}
                        className="rounded-lg bg-warning px-4 py-2 text-sm font-medium text-white hover:bg-warning/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hinzufügen
                      </button>
                    </div>
                  </div>

                  {currentMeeting.summary?.openQuestions && currentMeeting.summary.openQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {currentMeeting.summary.openQuestions.map((question, index) => (
                        <div
                          key={question.id || index}
                          className={`rounded-lg border bg-background p-4 transition-all ${
                            question.answered ? 'border-success/30 opacity-70' : 'border-warning/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                              question.answered ? 'bg-success text-white' : 'border-2 border-warning'
                            }`}>
                              {question.answered ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <CircleDot className="h-3 w-3 text-warning" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm ${
                                question.answered ? 'text-foreground-secondary' : 'text-foreground font-medium'
                              }`}>
                                {question.text}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                                <span>
                                  Gestellt: {format(new Date(question.timestamp || currentMeeting.createdAt), 'dd.MM.yyyy', { locale: de })}
                                </span>
                                {/* Clickable Assignee Selector */}
                                <div className="relative">
                                  <button
                                    onClick={() => setEditingQuestionAssignee(
                                      editingQuestionAssignee === question.id ? null : question.id
                                    )}
                                    className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                                  >
                                    <Users className="h-3 w-3" />
                                    {question.assigneeName ? (
                                      <span className="text-warning">@{question.assigneeName}</span>
                                    ) : (
                                      <span className="text-foreground-secondary/70 hover:text-foreground-secondary">Zuweisen...</span>
                                    )}
                                  </button>
                                  {editingQuestionAssignee === question.id && (
                                    <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg">
                                      <button
                                        onClick={() => handleUpdateQuestionAssignee(question.id, undefined, undefined)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary hover:bg-foreground/5"
                                      >
                                        <X className="h-3 w-3" />
                                        Kein Verantwortlicher
                                      </button>
                                      {meetingParticipants.map((participant) => (
                                        <button
                                          key={participant.id}
                                          onClick={() => handleUpdateQuestionAssignee(question.id, participant.id, participant.name)}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                                        >
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: participant.color }}
                                          />
                                          {participant.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Answer Input/Display */}
                              <div className="mt-3">
                                {editingQuestionAnswer === question.id ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={questionAnswerValue}
                                      onChange={(e) => setQuestionAnswerValue(e.target.value)}
                                      placeholder="Antwort eingeben..."
                                      className="w-full rounded-lg border border-foreground/10 bg-background-secondary px-3 py-2 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:border-primary focus:outline-none"
                                      rows={2}
                                      autoFocus
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingQuestionAnswer(null);
                                          setQuestionAnswerValue('');
                                        }}
                                        className="rounded-lg px-3 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/5"
                                      >
                                        Abbrechen
                                      </button>
                                      <button
                                        onClick={() => handleSaveQuestionAnswer(question.id)}
                                        className="rounded-lg bg-success px-3 py-1.5 text-xs text-white hover:bg-success/90"
                                      >
                                        Speichern
                                      </button>
                                    </div>
                                  </div>
                                ) : question.answer ? (
                                  <div
                                    onClick={() => {
                                      setEditingQuestionAnswer(question.id);
                                      setQuestionAnswerValue(question.answer || '');
                                    }}
                                    className="cursor-pointer rounded-lg border border-dashed border-success/30 bg-success/5 p-2 text-sm text-foreground hover:bg-success/10"
                                  >
                                    <span className="font-medium text-success">Antwort:</span> {question.answer}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingQuestionAnswer(question.id);
                                      setQuestionAnswerValue('');
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-foreground/10 p-2 text-sm text-foreground-secondary hover:border-foreground/20 hover:bg-foreground/5"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Antwort hinzufügen...
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleMarkQuestionAnswered(question.id)}
                              className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                question.answered
                                  ? 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
                                  : 'bg-success/10 text-success hover:bg-success/20'
                              }`}
                            >
                              {question.answered ? 'Öffnen' : 'Erledigt'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-secondary">
                      Keine offenen Fragen. Fragen werden automatisch aus dem Transkript extrahiert.
                    </p>
                  )}
                </div>
              </div>
              )}
            </div>
          </Tabs.Content>

          {/* AI Agent Tab Content */}
          <Tabs.Content value="ai" className="outline-none">
            <div className="flex h-[calc(100vh-16rem)] gap-4">
              {/* Chat Bereich (links) */}
              <div className="flex flex-1 flex-col rounded-lg border border-foreground/5 bg-background-secondary/50">
                {/* Quick Actions Bar */}
                <div className="flex flex-wrap gap-2 border-b border-foreground/5 p-4">
                  <span className="mr-2 flex items-center gap-1 text-xs text-foreground-secondary">
                    <Sparkles className="h-3 w-3" />
                    Schnellaktionen:
                  </span>
                  {AGENT_QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id, action.prompt)}
                      disabled={isAgentStreaming || (!settings.openaiApiKey && !settings.anthropicApiKey)}
                      className="flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {action.icon === 'Search' && <Search className="h-3 w-3" />}
                      {action.icon === 'HelpCircle' && <HelpCircle className="h-3 w-3" />}
                      {action.icon === 'Code' && <Code className="h-3 w-3" />}
                      {action.icon === 'Lightbulb' && <Lightbulb className="h-3 w-3" />}
                      {action.label}
                    </button>
                  ))}
                </div>

                {/* Chat Messages Area */}
                <div className="flex-1 overflow-y-auto p-4">
                  {agentMessages.length === 0 && !isAgentStreaming ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Bot className="h-12 w-12 text-foreground/20" />
                      <h3 className="mt-4 text-lg font-medium text-foreground">KI-Assistent</h3>
                      <p className="mt-2 max-w-md text-sm text-foreground-secondary">
                        Stelle Fragen zu diesem Meeting, lass dir bei Aufgaben helfen oder recherchiere Themen.
                        Der Assistent hat Zugriff auf alle Meeting-Daten und kann Aktionen für dich ausführen.
                      </p>
                      {!settings.openaiApiKey && !settings.anthropicApiKey && (
                        <p className="mt-4 text-sm text-warning">
                          Bitte konfiguriere einen API-Key in den Einstellungen, um den KI-Assistenten zu nutzen.
                        </p>
                      )}
                      {projectContext && (
                        <p className="mt-2 text-xs text-success">
                          Projekt &quot;{projectContext.name}&quot; ist verknüpft ({projectContext.totalFiles} Dateien)
                        </p>
                      )}
                      {selectedContextItem && (
                        <p className="mt-4 text-sm text-primary">
                          Wähle eine Schnellaktion oder stelle eine Frage zum ausgewählten Element.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agentMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-3 ${
                              message.role === 'user'
                                ? 'bg-primary text-white'
                                : 'bg-background border border-foreground/10'
                            }`}
                          >
                            {message.role === 'assistant' ? (
                              <StreamingText content={message.content} isStreaming={false} />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            )}
                            <p className="mt-1 text-xs opacity-60">
                              {format(new Date(message.timestamp), 'HH:mm', { locale: de })}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Streaming message */}
                      {isAgentStreaming && currentAgentStreamingContent && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-lg border border-foreground/10 bg-background px-4 py-3">
                            <StreamingText content={currentAgentStreamingContent} isStreaming={true} />
                          </div>
                        </div>
                      )}

                      {/* Loading indicator */}
                      {isAgentStreaming && !currentAgentStreamingContent && (
                        <div className="flex justify-start">
                          <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background px-4 py-3">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" style={{ animationDelay: '0.2s' }} />
                            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" style={{ animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      )}

                      <div ref={agentChatEndRef} />
                    </div>
                  )}
                </div>

                {/* Input Area with Context Chip */}
                <div className="border-t border-foreground/5 p-4">
                  {/* Context Chip */}
                  {selectedContextItem && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                        {selectedContextItem.type === 'task' && <ListTodo className="h-3 w-3" />}
                        {selectedContextItem.type === 'question' && <HelpCircle className="h-3 w-3" />}
                        {selectedContextItem.type === 'decision' && <CheckCircle2 className="h-3 w-3" />}
                        <span className="max-w-48 truncate">{selectedContextItem.title}</span>
                        <button
                          onClick={() => setSelectedContextItem(null)}
                          className="ml-1 rounded-full p-0.5 transition-colors hover:bg-primary/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={agentInput}
                      onChange={(e) => setAgentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendAgentMessage();
                        }
                      }}
                      placeholder={selectedContextItem ? `Frage zu "${selectedContextItem.title}"...` : "Frage eingeben..."}
                      disabled={isAgentStreaming || (!settings.openaiApiKey && !settings.anthropicApiKey)}
                      className="flex-1 rounded-lg border border-foreground/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {isAgentStreaming ? (
                      <button
                        onClick={handleCancelAgentStream}
                        className="flex items-center gap-2 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error/90"
                      >
                        <X className="h-4 w-4" />
                        Abbrechen
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSendAgentMessage()}
                        disabled={!agentInput.trim() || (!settings.openaiApiKey && !settings.anthropicApiKey)}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        Senden
                      </button>
                    )}
                  </div>

                  {/* Action buttons for selected item */}
                  {selectedContextItem && !isAgentStreaming && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedContextItem.type === 'task' && (
                        <button
                          onClick={async () => {
                            const task = selectedContextItem.data as Task;
                            if (task.status !== 'completed') {
                              await setTaskStatus(task.id, 'completed');
                              setMeetingTasks(prev => prev.map(t =>
                                t.id === task.id ? { ...t, status: 'completed', completedAt: new Date() } : t
                              ));
                              setSelectedContextItem(null);
                            }
                          }}
                          disabled={(selectedContextItem.data as Task).status === 'completed'}
                          className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Als erledigt markieren
                        </button>
                      )}
                      {selectedContextItem.type === 'question' && (
                        <button
                          onClick={async () => {
                            const question = selectedContextItem.data as MeetingQuestion;
                            if (!question.answered) {
                              await handleMarkQuestionAnswered(question.id);
                              setSelectedContextItem(null);
                            }
                          }}
                          disabled={(selectedContextItem.data as MeetingQuestion).answered}
                          className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Als beantwortet markieren
                        </button>
                      )}
                    </div>
                  )}

                  {isAgentStreaming && (
                    <p className="mt-2 text-center text-xs text-foreground-secondary">
                      KI denkt nach... Du kannst die Anfrage jederzeit abbrechen.
                    </p>
                  )}
                </div>
              </div>

              {/* Kontext-Sidebar (rechts) */}
              {!isSidebarCollapsed && (
                <div className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-foreground/5 bg-background-secondary/50">
                  <div className="flex-1 overflow-y-auto p-4">
                    {/* Aufgaben Section */}
                    <div className="mb-4">
                      <button
                        onClick={() => {
                          const section = document.getElementById('sidebar-tasks');
                          if (section) section.classList.toggle('hidden');
                        }}
                        className="mb-2 flex w-full items-center justify-between text-sm font-medium text-foreground"
                      >
                        <div className="flex items-center gap-2">
                          <ListTodo className="h-4 w-4 text-foreground-secondary" />
                          <span>Aufgaben</span>
                          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            {meetingTasks.filter(t => t.status !== 'completed').length}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                      </button>
                      <div id="sidebar-tasks" className="space-y-2">
                        {meetingTasks.filter(t => t.status !== 'completed').length === 0 ? (
                          <p className="text-xs text-foreground-secondary">Keine offenen Aufgaben</p>
                        ) : (
                          meetingTasks
                            .filter(t => t.status !== 'completed')
                            .slice(0, 5)
                            .map((task) => (
                              <button
                                key={task.id}
                                onClick={() => handleSelectContextItem({
                                  type: 'task',
                                  id: task.id,
                                  title: task.title,
                                  data: task,
                                })}
                                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                                  selectedContextItem?.id === task.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-foreground/5 bg-background hover:border-foreground/10'
                                }`}
                              >
                                <p className="text-xs font-medium text-foreground line-clamp-2">{task.title}</p>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    task.priority === 'urgent' ? 'bg-error/20 text-error' :
                                    task.priority === 'high' ? 'bg-warning/20 text-warning' :
                                    task.priority === 'medium' ? 'bg-primary/20 text-primary' :
                                    'bg-foreground/10 text-foreground-secondary'
                                  }`}>
                                    {task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟠' : task.priority === 'medium' ? '🟡' : '🟢'} {task.priority}
                                  </span>
                                  {task.assigneeName && (
                                    <span className="text-[10px] text-foreground-secondary">@{task.assigneeName}</span>
                                  )}
                                </div>
                              </button>
                            ))
                        )}
                        {meetingTasks.filter(t => t.status !== 'completed').length > 5 && (
                          <p className="text-xs text-foreground-secondary">
                            +{meetingTasks.filter(t => t.status !== 'completed').length - 5} weitere
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Offene Fragen Section */}
                    <div className="mb-4">
                      <button
                        onClick={() => {
                          const section = document.getElementById('sidebar-questions');
                          if (section) section.classList.toggle('hidden');
                        }}
                        className="mb-2 flex w-full items-center justify-between text-sm font-medium text-foreground"
                      >
                        <div className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-foreground-secondary" />
                          <span>Offene Fragen</span>
                          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            {currentMeeting?.summary?.openQuestions?.filter(q => !q.answered)?.length || 0}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                      </button>
                      <div id="sidebar-questions" className="space-y-2">
                        {!currentMeeting?.summary?.openQuestions?.filter(q => !q.answered)?.length ? (
                          <p className="text-xs text-foreground-secondary">Keine offenen Fragen</p>
                        ) : (
                          currentMeeting.summary.openQuestions
                            .filter(q => !q.answered)
                            .slice(0, 5)
                            .map((question) => (
                              <button
                                key={question.id}
                                onClick={() => handleSelectContextItem({
                                  type: 'question',
                                  id: question.id,
                                  title: question.text,
                                  data: question,
                                })}
                                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                                  selectedContextItem?.id === question.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-foreground/5 bg-background hover:border-foreground/10'
                                }`}
                              >
                                <p className="text-xs font-medium text-foreground line-clamp-2">
                                  <span className="text-primary">?</span> {question.text}
                                </p>
                                {question.assigneeName && (
                                  <p className="mt-1 text-[10px] text-foreground-secondary">@{question.assigneeName}</p>
                                )}
                              </button>
                            ))
                        )}
                        {(currentMeeting?.summary?.openQuestions?.filter(q => !q.answered)?.length || 0) > 5 && (
                          <p className="text-xs text-foreground-secondary">
                            +{(currentMeeting?.summary?.openQuestions?.filter(q => !q.answered)?.length || 0) - 5} weitere
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Entscheidungen Section */}
                    <div>
                      <button
                        onClick={() => {
                          const section = document.getElementById('sidebar-decisions');
                          if (section) section.classList.toggle('hidden');
                        }}
                        className="mb-2 flex w-full items-center justify-between text-sm font-medium text-foreground"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-foreground-secondary" />
                          <span>Entscheidungen</span>
                          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            {currentMeeting?.summary?.decisions?.length || 0}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                      </button>
                      <div id="sidebar-decisions" className="space-y-2">
                        {!currentMeeting?.summary?.decisions?.length ? (
                          <p className="text-xs text-foreground-secondary">Keine Entscheidungen</p>
                        ) : (
                          currentMeeting.summary.decisions
                            .slice(0, 5)
                            .map((decision) => (
                              <button
                                key={decision.id}
                                onClick={() => handleSelectContextItem({
                                  type: 'decision',
                                  id: decision.id,
                                  title: decision.text,
                                  data: decision,
                                })}
                                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                                  selectedContextItem?.id === decision.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-foreground/5 bg-background hover:border-foreground/10'
                                }`}
                              >
                                <p className="text-xs font-medium text-foreground line-clamp-2">
                                  <span className="text-success">✓</span> {decision.text}
                                </p>
                                {decision.assigneeName && (
                                  <p className="mt-1 text-[10px] text-foreground-secondary">@{decision.assigneeName}</p>
                                )}
                              </button>
                            ))
                        )}
                        {(currentMeeting?.summary?.decisions?.length || 0) > 5 && (
                          <p className="text-xs text-foreground-secondary">
                            +{(currentMeeting?.summary?.decisions?.length || 0) - 5} weitere
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Toggle Button */}
                  <div className="border-t border-foreground/5 p-3">
                    <button
                      onClick={() => setIsSidebarCollapsed(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground/5 px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:bg-foreground/10"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                      Sidebar ausblenden
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsed Sidebar Toggle */}
              {isSidebarCollapsed && (
                <button
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="flex h-fit items-center gap-1 rounded-lg border border-foreground/5 bg-background-secondary/50 px-2 py-2 text-foreground-secondary transition-colors hover:bg-foreground/5"
                  title="Sidebar einblenden"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              )}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </main>
    </div>
  );
}

// Default export with Suspense boundary
export default function MeetingRoomPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MeetingRoomContent />
    </Suspense>
  );
}
