'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, RotateCcw, Download, AlertCircle, Users, Folder, FileText, X, FileDown } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '@/lib/store/settings';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { useSpeakerStore } from '@/lib/store/speaker-store';
import { useLiveTranscript } from '@/hooks/use-live-transcript';
import { useHotkey } from '@/hooks/use-hotkey';
import { enrichTranscript } from '@/lib/ai/enrich';
import { GlassCard } from '@/components/ui/glass-card';
import { AnimatedOrb } from '@/components/ui/animated-orb';
import { ParticipantSelector } from '@/components/ui/participant-selector';
import { SettingsPanel } from '@/components/ui/settings-panel';
import { StreamingText } from '@/components/output/streaming-text';
import { saveSimpleToObsidian } from '@/lib/export/obsidian';

export default function Home() {
  const router = useRouter();
  const {
    recordingState,
    setRecordingState,
    currentMode,
    setCurrentMode,
    audioLevel,
    transcript,
    setTranscript,
    enrichedContent,
    setEnrichedContent,
    appendEnrichedContent,
    settings,
    error,
    setError,
    resetSession,
    addToHistory,
    addTranscriptionUsage,
    addEnrichmentUsage,
  } = useAppStore();

  const {
    currentMeetingId,
    activeRoomId,
    recordingStartTime,
    createRoomFromRecording,
    endMeeting,
    addTranscriptSegment,
    addRecording,
    setSummary,
    setActiveRoom,
  } = useMeetingStore();

  const { speakers, loadSpeakers } = useSpeakerStore();

  // Ref to track live transcript text (to avoid stale closures)
  const liveTranscriptRef = useRef<string>('');

  // Live Transcription
  const {
    isRecording: isLiveRecording,
    isPaused,
    segments: liveSegments,
    pendingChunks,
    isSpeaking,
    error: liveTranscriptError,
    start: startLive,
    stop: stopLive,
    pause: pauseLive,
    resume: resumeLive,
  } = useLiveTranscript({
    apiKey: settings.openaiApiKey,
    language: settings.language,
    onSegment: (segment) => {
      // Segment-Text an Transkript anhängen
      const newText = liveTranscriptRef.current
        ? `${liveTranscriptRef.current} ${segment.text}`
        : segment.text;
      liveTranscriptRef.current = newText;
      setTranscript(newText);
      // Track transcription usage
      addTranscriptionUsage((segment.endTime - segment.startTime) / 1000);
    },
  });

  // Reset live transcript ref when starting new recording
  useEffect(() => {
    if (isLiveRecording && !transcript) {
      liveTranscriptRef.current = '';
    }
  }, [isLiveRecording, transcript]);

  // Sync live transcript error
  useEffect(() => {
    if (liveTranscriptError) {
      setError(liveTranscriptError);
    }
  }, [liveTranscriptError, setError]);
  const [copied, setCopied] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [savedToObsidian, setSavedToObsidian] = useState(false);
  const [isSavingToObsidian, setIsSavingToObsidian] = useState(false);
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false); // Fix 1: Prevent race condition
  const pendingMeetingRef = useRef<string | null>(null);
  const isMountedRef = useRef(true); // Fix 3: Track mount state
  const isCurrentlyRecording = isLiveRecording; // Now uses live transcript state

  // Quick-Start form state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);

  // Fix 3: Track mount state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load speakers on mount
  useEffect(() => {
    loadSpeakers();
  }, [loadSpeakers]);

  // Reset activeRoomId when Voice Mode page mounts to ensure new meeting creation
  useEffect(() => {
    setActiveRoom(null);
  }, [setActiveRoom]);

  // Helper to parse structured data from AI response (Fix 7)
  const parseStructuredData = useCallback((content: string) => {
    const keyPoints: string[] = [];
    const decisions: { id: string; text: string; context?: string; timestamp: number; participants: string[] }[] = [];
    const openQuestions: { id: string; text: string; askedBy?: string; answered: boolean; timestamp: number }[] = [];

    try {
      // Parse key points (looking for bullet lists or numbered lists)
      const keyPointsMatch = content.match(/(?:Kernpunkte|Key Points|Wichtige Punkte|Zusammenfassung)[:\s]*\n((?:[-*•]\s*.+\n?)+)/i);
      if (keyPointsMatch) {
        const points = keyPointsMatch[1].match(/[-*•]\s*(.+)/g);
        if (points) {
          points.forEach((p) => {
            keyPoints.push(p.replace(/^[-*•]\s*/, '').trim());
          });
        }
      }

      // Parse decisions
      const decisionsMatch = content.match(/(?:Entscheidungen|Decisions|Beschlüsse)[:\s]*\n((?:[-*•]\s*.+\n?)+)/i);
      if (decisionsMatch) {
        const items = decisionsMatch[1].match(/[-*•]\s*(.+)/g);
        if (items) {
          items.forEach((d, i) => {
            decisions.push({
              id: `decision-${i}`,
              text: d.replace(/^[-*•]\s*/, '').trim(),
              timestamp: Date.now(),
              participants: [],
            });
          });
        }
      }

      // Parse open questions
      const questionsMatch = content.match(/(?:Offene Fragen|Open Questions|Fragen)[:\s]*\n((?:[-*•?]\s*.+\n?)+)/i);
      if (questionsMatch) {
        const items = questionsMatch[1].match(/[-*•?]\s*(.+)/g);
        if (items) {
          items.forEach((q, i) => {
            openQuestions.push({
              id: `question-${i}`,
              text: q.replace(/^[-*•?]\s*/, '').trim(),
              answered: false,
              timestamp: Date.now(),
            });
          });
        }
      }
    } catch (err) {
      console.error('Failed to parse structured data:', err);
    }

    return { keyPoints, decisions, openQuestions };
  }, []);

  // Process after recording stops - transcript already exists from live transcription
  const processAfterRecording = useCallback(
    async (meetingId: string | null) => {
      try {
        // Fix 3: Check if component is still mounted before state updates
        if (!isMountedRef.current) return;

        // Skip if no transcript (shouldn't happen with live transcription)
        if (!transcript) {
          setError('Kein Transkript vorhanden.');
          setRecordingState('idle');
          return;
        }

        // Only enrichment needed - transcription already happened during recording
        setRecordingState('enriching');
        setEnrichedContent('');
        setIsStreaming(true);

        let fullContent = '';
        try {
          // Create a timeout promise
          const timeoutMs = 60000; // 60 second timeout
          const enrichPromise = enrichTranscript({
            transcript,
            mode: currentMode,
            settings,
            onChunk: (chunk) => {
              appendEnrichedContent(chunk);
            },
          });

          const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('Enrichment timed out')), timeoutMs);
          });

          fullContent = await Promise.race([enrichPromise, timeoutPromise]);
        } catch (enrichErr) {
          console.error('Enrichment failed:', enrichErr);
          // Use transcript as fallback if enrichment fails
          fullContent = transcript;
          if (isMountedRef.current) {
            setEnrichedContent(transcript);
          }
        }

        // Fix 3: Check mount state after enrichment
        if (!isMountedRef.current) return;

        // Track enrichment usage
        addEnrichmentUsage(
          transcript,
          fullContent,
          settings.selectedProvider,
          settings.selectedModel
        );

        setIsStreaming(false);
        setRecordingState('idle');

        // Fix 7: Parse structured data from AI response
        const { keyPoints, decisions, openQuestions } = parseStructuredData(fullContent);

        // End the meeting and save summary
        if (meetingId) {
          await endMeeting(meetingId);
          await setSummary(meetingId, {
            overview: fullContent,
            keyPoints,
            decisions,
            openQuestions,
            generatedAt: new Date(),
          });
          // Reset activeRoomId for next session
          setActiveRoom(null);
          // Navigate to the meeting room
          router.push(`/meeting/room?id=${meetingId}`);
        }

        // Add to history (duration is calculated from segments)
        const totalDuration = liveSegments.reduce((acc, seg) => acc + (seg.endTime - seg.startTime), 0) / 1000;
        addToHistory({
          mode: currentMode,
          originalTranscript: transcript,
          enrichedContent: fullContent,
          timestamp: new Date(),
          duration: totalDuration || 0,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';

        // Detailliertere Fehlermeldung für Netzwerkprobleme
        if (message.toLowerCase().includes('network') || message.toLowerCase().includes('connection') || message.toLowerCase().includes('fetch')) {
          setError('Netzwerkverbindung verloren. Bitte prüfe deine Internetverbindung und versuche es erneut.');
        } else if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('aborted')) {
          setError('Zeitüberschreitung. Die Datei ist möglicherweise zu groß oder die Verbindung zu langsam.');
        } else if (message.toLowerCase().includes('retry') || message.toLowerCase().includes('retries')) {
          setError('Mehrere Versuche fehlgeschlagen. Bitte prüfe deine Internetverbindung.');
        } else {
          setError(message);
        }

        setRecordingState('idle');
        setIsStreaming(false);
      }
    },
    [
      currentMode,
      settings,
      transcript,
      setRecordingState,
      setEnrichedContent,
      appendEnrichedContent,
      setError,
      addToHistory,
      endMeeting,
      setSummary,
      setActiveRoom,
      router,
      parseStructuredData,
      addEnrichmentUsage,
    ]
  );

  // Reset Quick-Start form
  const resetQuickStartForm = useCallback(() => {
    setMeetingTitle('');
    setMeetingDescription('');
    setSelectedParticipants([]);
    setProjectPath(null);
  }, []);

  // Handle project folder selection
  const handleSelectProjectFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Projekt-Ordner auswählen',
      });
      if (selected && typeof selected === 'string') {
        setProjectPath(selected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Öffnen des Dialogs');
    }
  }, [setError]);

  // Handle toggle recording with live transcription
  const handleToggleRecording = useCallback(async () => {
    // Fix 1: Prevent multiple meeting creations
    if (isCreatingMeeting) {
      return;
    }

    // If currently recording, stop and process
    if (isCurrentlyRecording) {
      setRecordingState('recording'); // Keep UI in recording state while stopping
      await stopLive();
      // Recording stopped, process enrichment with the meeting ID
      const meetingId = pendingMeetingRef.current || activeRoomId;
      pendingMeetingRef.current = null;
      processAfterRecording(meetingId);
      return;
    }

    // Check if API key is available before starting
    if (!settings.openaiApiKey) {
      setError('OpenAI API-Key fehlt. Bitte in den Einstellungen hinterlegen.');
      return;
    }

    // Starting recording - create a new meeting room first
    if (!activeRoomId) {
      try {
        setIsCreatingMeeting(true);
        const meeting = await createRoomFromRecording({
          title: meetingTitle || undefined,
          description: meetingDescription || undefined,
          participantIds: selectedParticipants.length > 0 ? selectedParticipants : undefined,
          projectPath: projectPath || undefined,
        });
        pendingMeetingRef.current = meeting.id;
        // Reset the form after meeting is created
        resetQuickStartForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create meeting');
        setIsCreatingMeeting(false);
        return;
      } finally {
        setIsCreatingMeeting(false);
      }
    }

    // Start live transcription
    setRecordingState('recording');
    await startLive();
  }, [startLive, stopLive, processAfterRecording, isCurrentlyRecording, activeRoomId, createRoomFromRecording, isCreatingMeeting, setError, setRecordingState, meetingTitle, meetingDescription, selectedParticipants, projectPath, resetQuickStartForm, settings.openaiApiKey]);

  // Hotkey integration
  useHotkey(settings.hotkey, handleToggleRecording, {
    enabled: settings.hotkeyEnabled && recordingState !== 'transcribing' && recordingState !== 'enriching',
  });

  // Copy to clipboard
  const copyToClipboard = useCallback(async () => {
    if (!enrichedContent) return;
    try {
      await navigator.clipboard.writeText(enrichedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [enrichedContent, setError]);

  // Download as markdown
  const downloadMarkdown = useCallback(() => {
    if (!enrichedContent) return;
    const blob = new Blob([enrichedContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurora-${currentMode}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [enrichedContent, currentMode]);

  // Save to Obsidian
  const saveToObsidianCallback = useCallback(async () => {
    if (!enrichedContent || !settings.obsidianVaultPath) return;
    try {
      setIsSavingToObsidian(true);
      await saveSimpleToObsidian(
        enrichedContent,
        meetingTitle || `Aurora ${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}`,
        currentMode,
        settings
      );
      setSavedToObsidian(true);
      setTimeout(() => setSavedToObsidian(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern in Obsidian');
    } finally {
      setIsSavingToObsidian(false);
    }
  }, [enrichedContent, settings, meetingTitle, currentMode, setError]);

  const isProcessing =
    recordingState === 'transcribing' || recordingState === 'enriching';
  const hasOutput = enrichedContent.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-foreground/5 bg-background/80 px-4 backdrop-blur-xl">
        <h1 className="text-sm font-medium text-foreground">Voice Mode</h1>
        <div className="flex items-center gap-2">
          <SettingsPanel />
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
              <button
                onClick={() => setError(null)}
                className="text-error/60 hover:text-error"
              >
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* API Key Warning */}
        {!settings.openaiApiKey && recordingState === 'idle' && !hasOutput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 rounded-[var(--radius-lg)] bg-warning/10 p-4 text-center text-sm text-warning"
          >
            Bitte füge deinen OpenAI API Key in den Einstellungen hinzu, um zu starten.
          </motion.div>
        )}

        {/* Quick-Start Form */}
        <section className="mb-6 space-y-3">
          {/* Meeting Name */}
          <input
            type="text"
            placeholder="Meeting-Name (optional)"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            disabled={recordingState !== 'idle'}
            className="w-full rounded-lg bg-background-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          />

          {/* Two-column grid for Participants + Project */}
          <div className="grid grid-cols-2 gap-3">
            {/* Participant Dropdown */}
            <ParticipantSelector
              speakers={speakers}
              selected={selectedParticipants}
              onChange={setSelectedParticipants}
              disabled={recordingState !== 'idle'}
            />

            {/* Project Folder */}
            <button
              type="button"
              onClick={handleSelectProjectFolder}
              disabled={recordingState !== 'idle'}
              className="flex w-full items-center gap-2 rounded-lg bg-background-secondary px-4 py-2.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Folder className="h-4 w-4" />
              {projectPath ? (
                <span className="truncate text-foreground">{projectPath.split('/').pop()}</span>
              ) : (
                <span>Projekt (optional)</span>
              )}
              {projectPath && (
                <X
                  className="ml-auto h-4 w-4 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); setProjectPath(null); }}
                />
              )}
            </button>
          </div>

          {/* Description (optional, collapsed) */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-foreground-secondary hover:text-foreground">
              + Beschreibung hinzufügen
            </summary>
            <textarea
              placeholder="Kurze Beschreibung des Meetings..."
              value={meetingDescription}
              onChange={(e) => setMeetingDescription(e.target.value)}
              disabled={recordingState !== 'idle'}
              className="mt-2 w-full rounded-lg bg-background-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              rows={2}
            />
          </details>
        </section>

        {/* Orb Section */}
        <section className="flex flex-col items-center py-8">
          <AnimatedOrb
            state={recordingState}
            audioLevel={audioLevel}
            onClick={handleToggleRecording}
            disabled={isProcessing || isCreatingMeeting || !settings.openaiApiKey}
          />

          {/* Live Transcription Status */}
          {isCurrentlyRecording && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center justify-center gap-3"
            >
              {isSpeaking && (
                <span className="text-xs text-success flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  Spricht...
                </span>
              )}
              {pendingChunks > 0 && (
                <span className="text-xs text-foreground-secondary flex items-center gap-1">
                  <span className="h-2 w-2 animate-spin rounded-full border border-primary border-t-transparent" />
                  {pendingChunks} Chunk(s)
                </span>
              )}
            </motion.div>
          )}

          {/* Status Text für Enrichment */}
          {recordingState === 'enriching' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-sm text-foreground-secondary"
            >
              Generiere Zusammenfassung...
            </motion.div>
          )}
        </section>

        {/* Output Section */}
        <AnimatePresence mode="wait">
          {(hasOutput || transcript) && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-4"
            >
              {/* Original Transcript (collapsed) */}
              {transcript && (
                <GlassCard variant="subtle" className="text-sm">
                  <details className="group">
                    <summary className="cursor-pointer list-none text-foreground-secondary hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <span>Original Transkript</span>
                        <span className="text-xs opacity-60">
                          ({transcript.split(' ').length} Wörter)
                        </span>
                      </span>
                    </summary>
                    <p className="mt-3 text-foreground/80">{transcript}</p>
                  </details>
                </GlassCard>
              )}

              {/* Enriched Output */}
              {hasOutput && (
                <GlassCard>
                  {/* Actions Bar */}
                  <div className="mb-4 flex items-center justify-between border-b border-foreground/5 pb-3">
                    <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                      Ergebnis
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center gap-1.5 rounded-full bg-background-secondary px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10 hover:text-foreground"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Kopiert
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Kopieren
                          </>
                        )}
                      </button>
                      <button
                        onClick={downloadMarkdown}
                        className="flex items-center gap-1.5 rounded-full bg-background-secondary px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10 hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                      {settings.obsidianVaultPath && (
                        <button
                          onClick={saveToObsidianCallback}
                          disabled={isSavingToObsidian}
                          className="flex items-center gap-1.5 rounded-full bg-background-secondary px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savedToObsidian ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-success" />
                              Gespeichert
                            </>
                          ) : (
                            <>
                              <FileDown className="h-3.5 w-3.5" />
                              {isSavingToObsidian ? 'Speichert...' : 'Obsidian'}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={resetSession}
                        className="flex items-center gap-1.5 rounded-full bg-background-secondary px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-foreground/10 hover:text-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Neu
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <StreamingText content={enrichedContent} isStreaming={isStreaming} />
                </GlassCard>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!hasOutput && !transcript && recordingState === 'idle' && settings.openaiApiKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-foreground-secondary"
          >
            <p>Klicke auf den Orb oder drücke den Hotkey, um eine Aufnahme zu starten.</p>
            <p className="mt-2 text-xs opacity-60">
              Deine Sprache wird automatisch erkannt und intelligent verarbeitet.
            </p>
          </motion.div>
        )}
      </main>
    </div>
  );
}
