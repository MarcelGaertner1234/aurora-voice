'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Users, ChevronDown, User } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import type { Meeting } from '@/types/meeting';
import type { SpeakerProfile } from '@/types/speaker';

interface SpeakerMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: Meeting;
  detectedSpeakers: string[]; // e.g., ["Sprecher 1", "Sprecher 2", "Unknown"]
  participants: SpeakerProfile[];
  allSpeakers: SpeakerProfile[];
  onSave: (mapping: Record<string, string>) => void;
}

export function SpeakerMappingDialog({
  isOpen,
  onClose,
  meeting,
  detectedSpeakers,
  participants,
  allSpeakers,
  onSave,
}: SpeakerMappingDialogProps) {
  // Mapping state: detected speaker label -> speaker ID (or empty string for unassigned)
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const speaker of detectedSpeakers) {
      initial[speaker] = '';
    }
    return initial;
  });

  // Track which dropdown is open
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Group speakers: participants first, then others
  const groupedSpeakers = useMemo(() => {
    const participantSet = new Set(participants.map(p => p.id));
    const meetingParticipants = allSpeakers.filter(s => participantSet.has(s.id));
    const otherSpeakers = allSpeakers.filter(s => !participantSet.has(s.id));
    return { meetingParticipants, otherSpeakers };
  }, [participants, allSpeakers]);

  const handleSelectSpeaker = useCallback((detectedSpeaker: string, speakerId: string) => {
    setMapping(prev => ({
      ...prev,
      [detectedSpeaker]: speakerId,
    }));
    setOpenDropdown(null);
  }, []);

  const handleSave = useCallback(() => {
    // Filter out empty mappings
    const validMapping = Object.fromEntries(
      Object.entries(mapping).filter(([_, speakerId]) => speakerId !== '')
    );
    onSave(validMapping);
    onClose();
  }, [mapping, onSave, onClose]);

  const getSpeakerById = useCallback((id: string) => {
    return allSpeakers.find(s => s.id === id);
  }, [allSpeakers]);

  // Count how many speakers are mapped
  const mappedCount = Object.values(mapping).filter(v => v !== '').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg"
      >
        <GlassCard>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Sprecher zuordnen
              </h2>
              <p className="text-sm text-foreground-secondary">
                Ordne die erkannten Sprecher den Meeting-Teilnehmern zu
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-foreground-secondary hover:text-foreground hover:bg-foreground/5 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Participants hint */}
          {participants.length > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-foreground-secondary">
                {participants.length} Teilnehmer in diesem Meeting:
                <span className="ml-1 text-foreground">
                  {participants.map(p => p.name).join(', ')}
                </span>
              </span>
            </div>
          )}

          {/* Mapping list */}
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {detectedSpeakers.map((detectedSpeaker) => {
              const selectedSpeaker = mapping[detectedSpeaker]
                ? getSpeakerById(mapping[detectedSpeaker])
                : null;

              return (
                <div
                  key={detectedSpeaker}
                  className="flex items-center gap-3 rounded-lg bg-background-secondary/50 p-3"
                >
                  {/* Detected speaker label */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-foreground/30" />
                      <span className="font-medium text-foreground">
                        {detectedSpeaker}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <span className="text-foreground-secondary">→</span>

                  {/* Speaker dropdown */}
                  <div className="relative flex-1">
                    <button
                      onClick={() =>
                        setOpenDropdown(
                          openDropdown === detectedSpeaker ? null : detectedSpeaker
                        )
                      }
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm transition-colors hover:bg-foreground/5"
                    >
                      {selectedSpeaker ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: selectedSpeaker.color }}
                          />
                          <span className="text-foreground">{selectedSpeaker.name}</span>
                        </div>
                      ) : (
                        <span className="text-foreground-secondary">Auswählen...</span>
                      )}
                      <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                    </button>

                    {/* Dropdown */}
                    <AnimatePresence>
                      {openDropdown === detectedSpeaker && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-lg"
                        >
                          {/* Meeting participants */}
                          {groupedSpeakers.meetingParticipants.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-medium text-foreground-secondary bg-foreground/5">
                                Meeting-Teilnehmer
                              </div>
                              {groupedSpeakers.meetingParticipants.map((speaker) => (
                                <button
                                  key={speaker.id}
                                  onClick={() => handleSelectSpeaker(detectedSpeaker, speaker.id)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5 ${
                                    mapping[detectedSpeaker] === speaker.id
                                      ? 'bg-primary/10'
                                      : ''
                                  }`}
                                >
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: speaker.color }}
                                  />
                                  <span className="flex-1 text-foreground">{speaker.name}</span>
                                  {mapping[detectedSpeaker] === speaker.id && (
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </button>
                              ))}
                            </>
                          )}

                          {/* Other speakers */}
                          {groupedSpeakers.otherSpeakers.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-medium text-foreground-secondary bg-foreground/5 border-t border-foreground/10">
                                Andere Sprecher
                              </div>
                              {groupedSpeakers.otherSpeakers.map((speaker) => (
                                <button
                                  key={speaker.id}
                                  onClick={() => handleSelectSpeaker(detectedSpeaker, speaker.id)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5 ${
                                    mapping[detectedSpeaker] === speaker.id
                                      ? 'bg-primary/10'
                                      : ''
                                  }`}
                                >
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: speaker.color }}
                                  />
                                  <span className="flex-1 text-foreground">{speaker.name}</span>
                                  {mapping[detectedSpeaker] === speaker.id && (
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </button>
                              ))}
                            </>
                          )}

                          {/* Unassigned option */}
                          <div className="border-t border-foreground/10">
                            <button
                              onClick={() => handleSelectSpeaker(detectedSpeaker, '')}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/5 ${
                                mapping[detectedSpeaker] === '' ? 'bg-primary/10' : ''
                              }`}
                            >
                              <User className="h-3 w-3" />
                              <span>Nicht zuordnen</span>
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between border-t border-foreground/5 pt-4">
            <span className="text-sm text-foreground-secondary">
              {mappedCount} von {detectedSpeakers.length} zugeordnet
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-foreground-secondary transition-colors hover:bg-foreground/5"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                Speichern
              </button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// Helper to extract unique detected speakers from transcript segments
export function extractDetectedSpeakers(meeting: Meeting): string[] {
  if (!meeting.transcript?.segments) return [];

  const speakerLabels = new Set<string>();

  for (const segment of meeting.transcript.segments) {
    // Collect suggestedSpeakerId labels that aren't confirmed yet
    if (segment.suggestedSpeakerId && !segment.confirmed) {
      speakerLabels.add(segment.suggestedSpeakerId);
    }
    // Also collect unassigned segments
    if (!segment.speakerId && !segment.suggestedSpeakerId) {
      speakerLabels.add('Unbekannt');
    }
  }

  return Array.from(speakerLabels);
}
