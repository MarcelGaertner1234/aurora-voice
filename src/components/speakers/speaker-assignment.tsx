'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Plus, User, ChevronDown } from 'lucide-react';
import type { SpeakerProfile } from '@/types/speaker';
import type { TranscriptSegment } from '@/types/meeting';
import { getSpeakerDisplayName, getSpeakerColor } from '@/lib/diarization';

interface SpeakerAssignmentProps {
  segment: TranscriptSegment;
  speakers: SpeakerProfile[];
  meetingParticipantIds?: string[];
  onAssign: (segmentId: string, speakerId: string) => void;
  onReject: (segmentId: string) => void;
  onCreateSpeaker: (name: string) => Promise<SpeakerProfile>;
}

export function SpeakerAssignment({
  segment,
  speakers,
  meetingParticipantIds,
  onAssign,
  onReject,
  onCreateSpeaker,
}: SpeakerAssignmentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  const { name: displayName, isSuggestion } = getSpeakerDisplayName(
    segment.speakerId,
    segment.suggestedSpeakerId,
    speakers
  );

  const color = getSpeakerColor(
    segment.speakerId || segment.suggestedSpeakerId || null,
    speakers
  );

  const handleAssign = useCallback(
    (speakerId: string) => {
      onAssign(segment.id, speakerId);
      setIsOpen(false);
    },
    [segment.id, onAssign]
  );

  const handleReject = useCallback(() => {
    onReject(segment.id);
  }, [segment.id, onReject]);

  const handleCreateSpeaker = useCallback(async () => {
    if (!newSpeakerName.trim()) return;

    try {
      const speaker = await onCreateSpeaker(newSpeakerName.trim());
      onAssign(segment.id, speaker.id);
      setNewSpeakerName('');
      setIsCreating(false);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to create speaker:', err);
    }
  }, [newSpeakerName, onCreateSpeaker, onAssign, segment.id]);

  // If confirmed, show static badge
  if (segment.confirmed && segment.speakerId) {
    const speaker = speakers.find((s) => s.id === segment.speakerId);
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${speaker?.color || color}20`, color: speaker?.color || color }}
      >
        <User className="h-3 w-3" />
        {speaker?.name || 'Unknown'}
      </span>
    );
  }

  // If has suggestion, show confirmation UI
  if (segment.suggestedSpeakerId && !segment.confirmed) {
    const confidencePercent = segment.confidence ? Math.round(segment.confidence * 100) : null;
    const isHighConfidence = (segment.confidence || 0) >= 0.8;

    return (
      <div className="inline-flex items-center gap-1">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border border-dashed"
          style={{ borderColor: color, color }}
        >
          <User className="h-3 w-3" />
          {displayName}?
          {confidencePercent !== null && (
            <span
              className={`ml-1 px-1 py-0.5 rounded text-[10px] ${
                isHighConfidence
                  ? 'bg-success/20 text-success'
                  : 'bg-foreground/10 text-foreground-secondary'
              }`}
              title="Erkennungs-Konfidenz"
            >
              {confidencePercent}%
            </span>
          )}
        </span>
        <button
          onClick={() => handleAssign(segment.suggestedSpeakerId!)}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-success/10 text-success transition-colors hover:bg-success/20"
          title="Bestätigen"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          onClick={handleReject}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-error/10 text-error transition-colors hover:bg-error/20"
          title="Ablehnen"
        >
          <X className="h-3 w-3" />
        </button>
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground/5 text-foreground-secondary transition-colors hover:bg-foreground/10"
            title="Anderen Sprecher wählen"
          >
            <ChevronDown className="h-3 w-3" />
          </button>

          <AnimatePresence>
            {isOpen && (
              <SpeakerDropdown
                speakers={speakers}
                meetingParticipantIds={meetingParticipantIds}
                onSelect={handleAssign}
                onClose={() => setIsOpen(false)}
                isCreating={isCreating}
                setIsCreating={setIsCreating}
                newSpeakerName={newSpeakerName}
                setNewSpeakerName={setNewSpeakerName}
                onCreateSpeaker={handleCreateSpeaker}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // No speaker assigned - show assignment button
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10"
      >
        <User className="h-3 w-3" />
        Sprecher zuweisen
        <ChevronDown className="h-3 w-3" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <SpeakerDropdown
            speakers={speakers}
            meetingParticipantIds={meetingParticipantIds}
            onSelect={handleAssign}
            onClose={() => setIsOpen(false)}
            isCreating={isCreating}
            setIsCreating={setIsCreating}
            newSpeakerName={newSpeakerName}
            setNewSpeakerName={setNewSpeakerName}
            onCreateSpeaker={handleCreateSpeaker}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Dropdown for speaker selection
interface SpeakerDropdownProps {
  speakers: SpeakerProfile[];
  meetingParticipantIds?: string[];
  onSelect: (speakerId: string) => void;
  onClose: () => void;
  isCreating: boolean;
  setIsCreating: (value: boolean) => void;
  newSpeakerName: string;
  setNewSpeakerName: (value: string) => void;
  onCreateSpeaker: () => void;
}

function SpeakerDropdown({
  speakers,
  meetingParticipantIds,
  onSelect,
  onClose,
  isCreating,
  setIsCreating,
  newSpeakerName,
  setNewSpeakerName,
  onCreateSpeaker,
}: SpeakerDropdownProps) {
  // Group speakers by meeting participants and others
  const meetingParticipants = meetingParticipantIds
    ? speakers.filter(s => meetingParticipantIds.includes(s.id))
    : [];
  const otherSpeakers = meetingParticipantIds
    ? speakers.filter(s => !meetingParticipantIds.includes(s.id))
    : speakers;

  const hasMeetingParticipants = meetingParticipants.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -5, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.95 }}
      className="absolute left-0 top-full z-50 mt-1 w-48 rounded-[var(--radius)] bg-background border border-foreground/10 shadow-lg"
    >
      <div className="max-h-48 overflow-y-auto p-1">
        {speakers.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-foreground-secondary">
            Keine Sprecher vorhanden
          </p>
        ) : (
          <>
            {/* Meeting participants section */}
            {hasMeetingParticipants && (
              <>
                <div className="px-2 py-1 text-xs font-medium text-foreground-secondary bg-primary/5 rounded mb-1">
                  Meeting-Teilnehmer
                </div>
                {meetingParticipants.map((speaker) => (
                  <button
                    key={speaker.id}
                    onClick={() => onSelect(speaker.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-foreground/5"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: speaker.color }}
                    />
                    <span className="flex-1 truncate text-foreground">{speaker.name}</span>
                  </button>
                ))}
              </>
            )}

            {/* Other speakers section */}
            {otherSpeakers.length > 0 && (
              <>
                {hasMeetingParticipants && (
                  <div className="px-2 py-1 text-xs font-medium text-foreground-secondary bg-foreground/5 rounded mt-1 mb-1">
                    Andere Sprecher
                  </div>
                )}
                {otherSpeakers.map((speaker) => (
                  <button
                    key={speaker.id}
                    onClick={() => onSelect(speaker.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-foreground/5"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: speaker.color }}
                    />
                    <span className="flex-1 truncate text-foreground">{speaker.name}</span>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="border-t border-foreground/10 p-1">
        {isCreating ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newSpeakerName}
              onChange={(e) => setNewSpeakerName(e.target.value)}
              placeholder="Name eingeben..."
              className="flex-1 rounded bg-foreground/5 px-2 py-1 text-xs text-foreground placeholder:text-foreground-secondary/50 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateSpeaker();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewSpeakerName('');
                }
              }}
            />
            <button
              onClick={onCreateSpeaker}
              disabled={!newSpeakerName.trim()}
              className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-primary/5"
          >
            <Plus className="h-3 w-3" />
            Neuer Sprecher
          </button>
        )}
      </div>
    </motion.div>
  );
}

// Bulk assignment component
interface BulkSpeakerAssignmentProps {
  segments: TranscriptSegment[];
  speakers: SpeakerProfile[];
  onBulkAssign: (updates: Map<string, string>) => void;
}

export function BulkSpeakerAssignment({
  segments,
  speakers,
  onBulkAssign,
}: BulkSpeakerAssignmentProps) {
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  const unconfirmedSegments = segments.filter((s) => !s.confirmed);

  const handleToggleSegment = (segmentId: string) => {
    setSelectedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedSegments.size === unconfirmedSegments.length) {
      setSelectedSegments(new Set());
    } else {
      setSelectedSegments(new Set(unconfirmedSegments.map((s) => s.id)));
    }
  };

  const handleApply = () => {
    if (!selectedSpeaker || selectedSegments.size === 0) return;

    const updates = new Map<string, string>();
    for (const segmentId of selectedSegments) {
      updates.set(segmentId, selectedSpeaker);
    }

    onBulkAssign(updates);
    setSelectedSegments(new Set());
    setSelectedSpeaker(null);
  };

  if (unconfirmedSegments.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius)] bg-foreground/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium text-foreground-secondary">
          Mehrere Segmente zuweisen
        </h4>
        <button
          onClick={handleSelectAll}
          className="text-xs text-primary hover:underline"
        >
          {selectedSegments.size === unconfirmedSegments.length ? 'Keine' : 'Alle'} auswählen
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {unconfirmedSegments.slice(0, 10).map((segment) => (
          <button
            key={segment.id}
            onClick={() => handleToggleSegment(segment.id)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              selectedSegments.has(segment.id)
                ? 'bg-primary text-white'
                : 'bg-foreground/10 text-foreground-secondary hover:bg-foreground/20'
            }`}
          >
            {segment.text.slice(0, 20)}...
          </button>
        ))}
        {unconfirmedSegments.length > 10 && (
          <span className="px-2 py-0.5 text-xs text-foreground-secondary">
            +{unconfirmedSegments.length - 10} weitere
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedSpeaker || ''}
          onChange={(e) => setSelectedSpeaker(e.target.value || null)}
          className="flex-1 rounded bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Sprecher wählen...</option>
          {speakers.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>
              {speaker.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleApply}
          disabled={!selectedSpeaker || selectedSegments.size === 0}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Zuweisen ({selectedSegments.size})
        </button>
      </div>
    </div>
  );
}
