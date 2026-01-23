'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Plus,
  Calendar,
  Clock,
  Users,
  ChevronRight,
  Play,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ClipboardList,
  FileBarChart,
  X,
  Check,
  Search,
} from 'lucide-react';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useSpeakerStore } from '@/lib/store/speaker-store';
import { GlassCard } from '@/components/ui/glass-card';
import type { Meeting, MeetingStatus } from '@/types/meeting';
import type { SpeakerProfile } from '@/types/speaker';

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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

// Meeting card component
function MeetingCard({
  meeting,
  onStart,
  onDelete,
  onView,
  onPrep,
  onSummary,
}: {
  meeting: Meeting;
  onStart: () => void;
  onDelete: () => void;
  onView: () => void;
  onPrep: () => void;
  onSummary: () => void;
}) {
  const duration =
    meeting.startedAt && meeting.endedAt
      ? Math.round((meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60000)
      : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <GlassCard className="group cursor-pointer transition-all hover:ring-2 hover:ring-primary/20">
        <div className="flex items-start justify-between">
          <div className="flex-1" onClick={onView}>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground">{meeting.title}</h3>
              <StatusBadge status={meeting.status} />
            </div>

            {meeting.description && (
              <p className="mt-1 text-sm text-foreground-secondary line-clamp-2">
                {meeting.description}
              </p>
            )}

            <div className="mt-3 flex items-center gap-4 text-xs text-foreground-secondary">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(meeting.createdAt, 'dd. MMM yyyy', { locale: de })}
              </span>

              {duration !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {duration} Min.
                </span>
              )}

              {meeting.participantIds.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {meeting.participantIds.length}
                </span>
              )}

              {meeting.taskIds.length > 0 && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {meeting.taskIds.length} Tasks
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Prep button - available for scheduled meetings */}
            {meeting.status === 'scheduled' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPrep();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 transition-colors hover:bg-amber-500/20"
                title="Meeting vorbereiten"
              >
                <ClipboardList className="h-4 w-4" />
              </button>
            )}

            {/* Start button - available for scheduled meetings */}
            {meeting.status === 'scheduled' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStart();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success transition-colors hover:bg-success/20"
                title="Meeting starten"
              >
                <Play className="h-4 w-4" />
              </button>
            )}

            {/* Summary button - available for completed meetings */}
            {meeting.status === 'completed' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSummary();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                title="Zusammenfassung anzeigen"
              >
                <FileBarChart className="h-4 w-4" />
              </button>
            )}

            {/* View transcript button - available for completed meetings */}
            {meeting.status === 'completed' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground-secondary transition-colors hover:bg-foreground/20"
                title="Transkript anzeigen"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-error/10 text-error opacity-0 transition-all hover:bg-error/20 group-hover:opacity-100"
              title="Löschen"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <ChevronRight className="h-5 w-5 text-foreground-secondary" />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// Create meeting dialog
function CreateMeetingDialog({
  isOpen,
  onClose,
  onCreate,
  speakers,
  onCreateSpeaker,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, description?: string, participantIds?: string[]) => Promise<void> | void;
  speakers: SpeakerProfile[];
  onCreateSpeaker: (name: string) => Promise<SpeakerProfile>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  const [isCreatingParticipant, setIsCreatingParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');

  // Fix: Reset form state when dialog opens (prevents race conditions)
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setSelectedParticipants([]);
      setParticipantSearch('');
      setShowParticipantDropdown(false);
      setIsCreatingParticipant(false);
      setNewParticipantName('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      try {
        await onCreate(
          title.trim(),
          description.trim() || undefined,
          selectedParticipants.length > 0 ? selectedParticipants : undefined
        );
        setTitle('');
        setDescription('');
        setSelectedParticipants([]);
        setParticipantSearch('');
        onClose();
      } catch (error) {
        console.error('Failed to create meeting:', error);
      }
    }
  };

  const handleAddParticipant = (speakerId: string) => {
    if (!selectedParticipants.includes(speakerId)) {
      setSelectedParticipants([...selectedParticipants, speakerId]);
    }
    setParticipantSearch('');
    setShowParticipantDropdown(false);
  };

  const handleRemoveParticipant = (speakerId: string) => {
    setSelectedParticipants(selectedParticipants.filter(id => id !== speakerId));
  };

  const handleCreateParticipant = async () => {
    if (!newParticipantName.trim()) return;
    try {
      const speaker = await onCreateSpeaker(newParticipantName.trim());
      handleAddParticipant(speaker.id);
      setNewParticipantName('');
      setIsCreatingParticipant(false);
    } catch (err) {
      console.error('Failed to create participant:', err);
    }
  };

  // Filter speakers by search query and exclude already selected
  const filteredSpeakers = speakers.filter(
    s =>
      !selectedParticipants.includes(s.id) &&
      s.name.toLowerCase().includes(participantSearch.toLowerCase())
  );

  // Get selected speaker objects
  const selectedSpeakers = selectedParticipants
    .map(id => speakers.find(s => s.id === id))
    .filter((s): s is SpeakerProfile => s !== undefined);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <GlassCard>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Neues Meeting</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Titel
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting-Titel eingeben..."
                className="w-full rounded-[var(--radius)] bg-background-secondary px-3 py-2 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Beschreibung (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kurze Beschreibung..."
                rows={3}
                className="w-full resize-none rounded-[var(--radius)] bg-background-secondary px-3 py-2 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Participants Section */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Teilnehmer (optional)
              </label>

              {/* Selected Participants as Chips */}
              {selectedSpeakers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {selectedSpeakers.map(speaker => (
                    <span
                      key={speaker.id}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${speaker.color}20`, color: speaker.color }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: speaker.color }}
                      />
                      {speaker.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(speaker.id)}
                        className="ml-0.5 rounded-full hover:bg-foreground/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Participant Search/Add */}
              <div className="relative">
                <div className="flex items-center gap-1.5 rounded-[var(--radius)] bg-background-secondary px-3 py-2">
                  <Search className="h-4 w-4 text-foreground-secondary" />
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => {
                      setParticipantSearch(e.target.value);
                      setShowParticipantDropdown(true);
                    }}
                    onFocus={() => setShowParticipantDropdown(true)}
                    placeholder="Teilnehmer suchen oder hinzufügen..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none"
                  />
                </div>

                {/* Dropdown */}
                <AnimatePresence>
                  {showParticipantDropdown && (participantSearch || speakers.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-[var(--radius)] border border-foreground/10 bg-background shadow-lg"
                    >
                      {/* Existing speakers */}
                      {filteredSpeakers.length > 0 ? (
                        filteredSpeakers.map(speaker => (
                          <button
                            key={speaker.id}
                            type="button"
                            onClick={() => handleAddParticipant(speaker.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-foreground/5"
                          >
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: speaker.color }}
                            />
                            <span className="text-foreground">{speaker.name}</span>
                          </button>
                        ))
                      ) : participantSearch && !isCreatingParticipant ? (
                        <div className="px-3 py-2 text-sm text-foreground-secondary">
                          Keine Sprecher gefunden
                        </div>
                      ) : null}

                      {/* Create new participant */}
                      <div className="border-t border-foreground/10">
                        {isCreatingParticipant ? (
                          <div className="flex items-center gap-2 p-2">
                            <input
                              type="text"
                              value={newParticipantName}
                              onChange={(e) => setNewParticipantName(e.target.value)}
                              placeholder="Name eingeben..."
                              className="flex-1 rounded bg-foreground/5 px-2 py-1 text-sm text-foreground focus:outline-none"
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
                              type="button"
                              onClick={handleCreateParticipant}
                              disabled={!newParticipantName.trim()}
                              className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingParticipant(false);
                                setNewParticipantName('');
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded bg-foreground/10 text-foreground-secondary"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCreatingParticipant(true);
                              setNewParticipantName(participantSearch);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-primary/5"
                          >
                            <Plus className="h-3 w-3" />
                            {participantSearch
                              ? `"${participantSearch}" als neuen Teilnehmer anlegen`
                              : 'Neuen Teilnehmer anlegen'}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--radius)] px-4 py-2 text-sm text-foreground-secondary transition-colors hover:bg-foreground/5"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Erstellen
              </button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export default function MeetingsPage() {
  const router = useRouter();
  const {
    meetings,
    isLoading,
    error,
    loadMeetings,
    createMeeting,
    deleteMeeting,
    startMeeting,
    clearError,
  } = useMeetingStore();

  const { speakers, loadSpeakers, createSpeaker } = useSpeakerStore();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');

  // Load meetings and speakers on mount
  useEffect(() => {
    loadMeetings();
    loadSpeakers();
  }, [loadMeetings, loadSpeakers]);

  // Handle create meeting
  const handleCreateMeeting = useCallback(
    async (title: string, description?: string, participantIds?: string[]) => {
      const meeting = await createMeeting({ title, description, participantIds });
      router.push(`/meeting/live?id=${meeting.id}`);
    },
    [createMeeting, router]
  );

  // Handle create speaker
  const handleCreateSpeaker = useCallback(
    async (name: string) => {
      return await createSpeaker({ name });
    },
    [createSpeaker]
  );

  // Handle start meeting
  const handleStartMeeting = useCallback(
    async (meetingId: string) => {
      await startMeeting(meetingId);
      router.push(`/meeting/live?id=${meetingId}`);
    },
    [startMeeting, router]
  );

  // Handle delete meeting
  const handleDeleteMeeting = useCallback(
    async (meetingId: string) => {
      if (confirm('Meeting wirklich löschen?')) {
        await deleteMeeting(meetingId);
      }
    },
    [deleteMeeting]
  );

  // Handle view meeting
  const handleViewMeeting = useCallback(
    (meetingId: string) => {
      router.push(`/meeting/live?id=${meetingId}`);
    },
    [router]
  );

  // Handle prep meeting
  const handlePrepMeeting = useCallback(
    (meetingId: string) => {
      router.push(`/meeting/prep?id=${meetingId}`);
    },
    [router]
  );

  // Handle view summary
  const handleViewSummary = useCallback(
    (meetingId: string) => {
      router.push(`/meeting/summary?id=${meetingId}`);
    },
    [router]
  );

  // Filter meetings
  const filteredMeetings = meetings.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'scheduled') return m.status === 'scheduled';
    if (filter === 'completed') return m.status === 'completed';
    return true;
  });

  // Stats
  const stats = {
    total: meetings.length,
    scheduled: meetings.filter((m) => m.status === 'scheduled').length,
    completed: meetings.filter((m) => m.status === 'completed').length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="titlebar-drag-region sticky top-0 z-40 flex h-14 items-center justify-between border-b border-foreground/5 bg-background/80 px-4 backdrop-blur-xl">
        <div className="titlebar-no-drag flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-medium text-foreground">Meetings</h1>
        </div>
        <div className="titlebar-no-drag">
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Neues Meeting
          </button>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-8">
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
              <button onClick={clearError} className="text-error/60 hover:text-error">
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <GlassCard variant="subtle" className="text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-xs text-foreground-secondary">Gesamt</div>
          </GlassCard>
          <GlassCard variant="subtle" className="text-center">
            <div className="text-2xl font-bold text-primary">{stats.scheduled}</div>
            <div className="text-xs text-foreground-secondary">Geplant</div>
          </GlassCard>
          <GlassCard variant="subtle" className="text-center">
            <div className="text-2xl font-bold text-success">{stats.completed}</div>
            <div className="text-xs text-foreground-secondary">Abgeschlossen</div>
          </GlassCard>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2">
          {(['all', 'scheduled', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                filter === f
                  ? 'bg-primary text-white'
                  : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
              }`}
            >
              {f === 'all' && 'Alle'}
              {f === 'scheduled' && 'Geplant'}
              {f === 'completed' && 'Abgeschlossen'}
            </button>
          ))}
        </div>

        {/* Meeting List */}
        {isLoading ? (
          <div className="text-center text-foreground-secondary">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-2 text-sm">Lade Meetings...</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
                <Calendar className="h-8 w-8 text-foreground-secondary" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-foreground">Keine Meetings</h3>
            <p className="mt-1 text-sm text-foreground-secondary">
              Erstelle dein erstes Meeting, um loszulegen.
            </p>
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Neues Meeting
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onStart={() => handleStartMeeting(meeting.id)}
                  onDelete={() => handleDeleteMeeting(meeting.id)}
                  onView={() => handleViewMeeting(meeting.id)}
                  onPrep={() => handlePrepMeeting(meeting.id)}
                  onSummary={() => handleViewSummary(meeting.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Create Dialog */}
      <CreateMeetingDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateMeeting}
        speakers={speakers}
        onCreateSpeaker={handleCreateSpeaker}
      />
    </div>
  );
}
