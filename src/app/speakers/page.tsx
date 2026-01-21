'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArrowLeft,
  Plus,
  Search,
  User,
  Trash2,
  Edit2,
  Calendar,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';
import { useSpeakerStore } from '@/lib/store/speaker-store';
import { GlassCard } from '@/components/ui/glass-card';
import { SpeakerDot } from '@/components/transcript/speaker-label';
import { SPEAKER_COLORS } from '@/types/speaker';
import type { SpeakerProfile } from '@/types/speaker';

// Format duration as HH:MM:SS
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// Speaker card component
interface SpeakerCardProps {
  speaker: SpeakerProfile;
  onEdit: () => void;
  onDelete: () => void;
}

function SpeakerCard({ speaker, onEdit, onDelete }: SpeakerCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <GlassCard className="group">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-white font-semibold text-lg"
            style={{ backgroundColor: speaker.color }}
          >
            {speaker.name.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground truncate">{speaker.name}</h3>
            {speaker.email && (
              <p className="text-sm text-foreground-secondary truncate">{speaker.email}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground-secondary">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {speaker.meetingCount} Meetings
              </span>

              {speaker.totalSpeakingTime > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(speaker.totalSpeakingTime)}
                </span>
              )}

              {speaker.lastSeenAt && (
                <span>
                  Zuletzt: {format(speaker.lastSeenAt, 'dd.MM.yyyy', { locale: de })}
                </span>
              )}
            </div>

            {speaker.voiceCharacteristics && (
              <p className="mt-2 text-xs text-foreground-secondary italic">
                "{speaker.voiceCharacteristics}"
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
              title="Bearbeiten"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="flex h-8 w-8 items-center justify-center rounded-full text-error/60 transition-colors hover:bg-error/10 hover:text-error"
              title="Löschen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// Speaker form dialog
interface SpeakerFormDialogProps {
  isOpen: boolean;
  speaker?: SpeakerProfile;
  onClose: () => void;
  onSave: (data: { name: string; email?: string; color: string; voiceCharacteristics?: string }) => void;
}

// Email validation helper
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function SpeakerFormDialog({ isOpen, speaker, onClose, onSave }: SpeakerFormDialogProps) {
  const [name, setName] = useState(speaker?.name || '');
  const [email, setEmail] = useState(speaker?.email || '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [color, setColor] = useState(speaker?.color || SPEAKER_COLORS[0]);
  const [voiceCharacteristics, setVoiceCharacteristics] = useState(speaker?.voiceCharacteristics || '');

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(speaker?.name || '');
      setEmail(speaker?.email || '');
      setEmailError(null);
      setColor(speaker?.color || SPEAKER_COLORS[0]);
      setVoiceCharacteristics(speaker?.voiceCharacteristics || '');
    }
  }, [isOpen, speaker]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email if provided
    const trimmedEmail = email.trim();
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setEmailError('Ungültiges E-Mail-Format');
      return;
    }
    setEmailError(null);

    if (name.trim()) {
      onSave({
        name: name.trim(),
        email: trimmedEmail || undefined,
        color,
        voiceCharacteristics: voiceCharacteristics.trim() || undefined,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <GlassCard>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {speaker ? 'Sprecher bearbeiten' : 'Neuer Sprecher'}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name eingeben..."
                className="w-full rounded-[var(--radius)] bg-background-secondary px-3 py-2 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                E-Mail (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="email@example.com"
                className={`w-full rounded-[var(--radius)] bg-background-secondary px-3 py-2 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 ${
                  emailError ? 'ring-2 ring-error focus:ring-error' : 'focus:ring-primary'
                }`}
              />
              {emailError && (
                <p className="mt-1 text-xs text-error">{emailError}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Farbe
              </label>
              <div className="flex flex-wrap gap-2">
                {SPEAKER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Stimm-Merkmale (optional)
              </label>
              <textarea
                value={voiceCharacteristics}
                onChange={(e) => setVoiceCharacteristics(e.target.value)}
                placeholder="z.B. tiefe Stimme, spricht schnell..."
                rows={2}
                className="w-full resize-none rounded-[var(--radius)] bg-background-secondary px-3 py-2 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-foreground-secondary">
                Hilft bei der manuellen Zuordnung von Sprechern
              </p>
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
                disabled={!name.trim()}
                className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {speaker ? 'Speichern' : 'Erstellen'}
              </button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export default function SpeakersPage() {
  const router = useRouter();
  const {
    speakers,
    filteredSpeakers,
    stats,
    isLoading,
    error,
    loadSpeakers,
    createSpeaker,
    updateSpeaker,
    deleteSpeaker,
    setFilters,
    clearError,
  } = useSpeakerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<SpeakerProfile | undefined>();

  // Load speakers on mount
  useEffect(() => {
    loadSpeakers();
  }, [loadSpeakers]);

  // Update filters when search changes
  useEffect(() => {
    setFilters({ searchQuery: searchQuery || undefined });
  }, [searchQuery, setFilters]);

  // Handle create/edit speaker
  const handleSaveSpeaker = useCallback(
    async (data: { name: string; email?: string; color: string; voiceCharacteristics?: string }) => {
      try {
        if (editingSpeaker) {
          await updateSpeaker(editingSpeaker.id, data);
        } else {
          await createSpeaker(data);
        }
        setIsFormOpen(false);
        setEditingSpeaker(undefined);
      } catch (err) {
        console.error('Failed to save speaker:', err);
      }
    },
    [editingSpeaker, createSpeaker, updateSpeaker]
  );

  // Handle delete speaker
  const handleDeleteSpeaker = useCallback(
    async (speakerId: string) => {
      if (confirm('Sprecher wirklich löschen?')) {
        await deleteSpeaker(speakerId);
      }
    },
    [deleteSpeaker]
  );

  // Handle edit speaker
  const handleEditSpeaker = useCallback((speaker: SpeakerProfile) => {
    setEditingSpeaker(speaker);
    setIsFormOpen(true);
  }, []);

  // Handle create new speaker
  const handleCreateSpeaker = useCallback(() => {
    setEditingSpeaker(undefined);
    setIsFormOpen(true);
  }, []);

  const displaySpeakers = searchQuery ? filteredSpeakers : speakers;

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
          <h1 className="text-sm font-medium text-foreground">Sprecher-Verzeichnis</h1>
        </div>
        <div className="titlebar-no-drag">
          <button
            onClick={handleCreateSpeaker}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Neuer Sprecher
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
            <div className="text-2xl font-bold text-foreground">{stats.totalSpeakers}</div>
            <div className="text-xs text-foreground-secondary">Gesamt</div>
          </GlassCard>
          <GlassCard variant="subtle" className="text-center">
            <div className="text-2xl font-bold text-success">{stats.activeSpeakers}</div>
            <div className="text-xs text-foreground-secondary">Aktiv (30 Tage)</div>
          </GlassCard>
          <GlassCard variant="subtle" className="text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.averageMeetingsPerSpeaker.toFixed(1)}
            </div>
            <div className="text-xs text-foreground-secondary">Ø Meetings</div>
          </GlassCard>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sprecher suchen..."
              className="w-full rounded-[var(--radius)] bg-foreground/5 py-2.5 pl-10 pr-4 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Speaker List */}
        {isLoading ? (
          <div className="text-center text-foreground-secondary">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-2 text-sm">Lade Sprecher...</p>
          </div>
        ) : displaySpeakers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
                <User className="h-8 w-8 text-foreground-secondary" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-foreground">
              {searchQuery ? 'Keine Sprecher gefunden' : 'Noch keine Sprecher'}
            </h3>
            <p className="mt-1 text-sm text-foreground-secondary">
              {searchQuery
                ? 'Versuche eine andere Suche.'
                : 'Füge Sprecher hinzu, um sie in Meetings zu erkennen.'}
            </p>
            {!searchQuery && (
              <button
                onClick={handleCreateSpeaker}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Neuer Sprecher
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {displaySpeakers.map((speaker) => (
                <SpeakerCard
                  key={speaker.id}
                  speaker={speaker}
                  onEdit={() => handleEditSpeaker(speaker)}
                  onDelete={() => handleDeleteSpeaker(speaker.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Form Dialog */}
      <SpeakerFormDialog
        isOpen={isFormOpen}
        speaker={editingSpeaker}
        onClose={() => {
          setIsFormOpen(false);
          setEditingSpeaker(undefined);
        }}
        onSave={handleSaveSpeaker}
      />
    </div>
  );
}
