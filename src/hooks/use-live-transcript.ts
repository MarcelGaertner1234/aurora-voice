'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { AudioChunker, SmartAudioChunker, type AudioChunk } from '@/lib/audio/chunker';
import { VoiceActivityDetector, type VADState } from '@/lib/audio/vad';
import { AudioRecorder } from '@/lib/audio/recorder';
import {
  createLiveMeetingState,
  processSegment,
  getLiveMeetingStats,
  DEFAULT_KEYWORD_CATEGORIES,
  type LiveMeetingState,
  type LiveMeetingStats,
  type KeywordCategory,
  type DetectedDecision,
  type DetectedQuestion,
} from '@/lib/meetings/live';
import type { TranscriptSegment } from '@/types/meeting';
import { createWhisperFormData } from '@/lib/audio/recorder';
import { convertAudioToWav } from '@/lib/ai/transcribe';

export interface UseLiveTranscriptOptions {
  /** API endpoint for transcription */
  apiEndpoint?: string;
  /** API key for transcription service */
  apiKey?: string;
  /** Language for transcription */
  language?: string;
  /** Chunk duration in ms (default: 5000) */
  chunkDuration?: number;
  /** Use smart chunking with VAD (default: true) */
  useSmartChunking?: boolean;
  /** Custom keyword categories */
  keywordCategories?: KeywordCategory[];
  /** Callback when new segment is transcribed */
  onSegment?: (segment: TranscriptSegment) => void;
  /** Callback when decision is detected */
  onDecision?: (decision: DetectedDecision) => void;
  /** Callback when question is detected */
  onQuestion?: (question: DetectedQuestion) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface LiveTranscriptState {
  isRecording: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  duration: number;
  segments: TranscriptSegment[];
  pendingChunks: number;
  audioLevel: number;
  isSpeaking: boolean;
  stats: LiveMeetingStats;
  decisions: DetectedDecision[];
  questions: DetectedQuestion[];
  error: string | null;
}

export interface StopResult {
  audioBlob: Blob | null;
  audioMimeType: string;
  audioDuration: number;
}

const DEFAULT_OPTIONS: Required<Omit<UseLiveTranscriptOptions, 'onSegment' | 'onDecision' | 'onQuestion' | 'onError' | 'apiKey'>> = {
  apiEndpoint: 'https://api.openai.com/v1/audio/transcriptions',
  language: 'de',
  chunkDuration: 5000,
  useSmartChunking: true,
  keywordCategories: DEFAULT_KEYWORD_CATEGORIES,
};

// Maximal 4 parallele Whisper Requests to avoid rate limiting
const MAX_CONCURRENT_REQUESTS = 4;

// Silence detection thresholds
const SILENCE_THRESHOLD = 0.01; // RMS threshold for silence detection
const MAX_SILENCE_RATIO = 0.7; // Skip chunks with >70% silence

// Hallucination detection patterns (known Whisper hallucinations)
const HALLUCINATION_PATTERNS = [
  /diät|abnehm|shake|schlank/i,           // Weight loss ads (common Whisper hallucination)
  /vielen dank für.*zusehen/i,            // YouTube outro patterns
  /abonnieren|liken|glocke/i,             // YouTube call-to-action
  /musik|♪|🎵|🎶/i,                        // Music descriptions
  /\[.*\]/,                                // Bracketed descriptions like [Music], [Applause]
  /untertitel.*erstellt/i,                 // Subtitle credits
  /©|copyright/i,                          // Copyright notices
  /deutsch lernen.*präsentiert/i,         // German learning channel intros
  /lernen.*präsentiert|präsentiert.*lernen/i, // Learning channel variations
  /willkommen.*kanal/i,                   // "Welcome to my channel" patterns
];

/**
 * Checks if the transcribed text is likely a Whisper hallucination.
 * Returns true if the text should be filtered out.
 */
function isLikelyHallucination(text: string, confidence: number): boolean {
  // Low confidence is a strong indicator of hallucination
  if (confidence < 0.4) return true;

  // Very short text is often noise
  if (text.length < 5) return true;

  // Check against known hallucination patterns
  return HALLUCINATION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Analyzes an audio blob to determine the ratio of silence.
 * Returns a value between 0 (all speech) and 1 (all silence).
 */
async function analyzeSilenceRatio(audioBlob: Blob): Promise<number> {
  try {
    const audioContext = new AudioContext();
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get mono audio data (use first channel)
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      // Analyze in 50ms windows
      const windowSize = Math.floor(sampleRate * 0.05);
      const numWindows = Math.floor(channelData.length / windowSize);

      let silentWindows = 0;

      for (let i = 0; i < numWindows; i++) {
        const start = i * windowSize;
        const end = start + windowSize;

        // Calculate RMS for this window
        let sumSquares = 0;
        for (let j = start; j < end; j++) {
          sumSquares += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sumSquares / windowSize);

        if (rms < SILENCE_THRESHOLD) {
          silentWindows++;
        }
      }

      return numWindows > 0 ? silentWindows / numWindows : 0;
    } finally {
      await audioContext.close();
    }
  } catch (error) {
    // If analysis fails, don't skip the chunk (err on the side of processing)
    console.debug('[Silence] Analysis failed, processing chunk anyway:', error);
    return 0;
  }
}

export function useLiveTranscript(options: UseLiveTranscriptOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Refs for audio handling
  const chunkerRef = useRef<AudioChunker | SmartAudioChunker | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Fix C5: Use Map to track all active transcription requests
  const transcribeAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Retry queue for chunks that were skipped due to rate limiting
  const retryQueueRef = useRef<AudioChunk[]>([]);
  const isProcessingRetryQueueRef = useRef(false);
  // Ref to hold handleChunk callback to break circular dependency
  const handleChunkRef = useRef<((chunk: AudioChunk) => Promise<void>) | null>(null);
  const isPausedRef = useRef(false); // Track isPaused without stale closure
  const durationRef = useRef(0); // Track duration without stale closure
  const apiKeyRef = useRef(options.apiKey); // Track apiKey without stale closure
  // Ref for parallel audio recording (to save complete audio)
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // State
  const [meetingState, setMeetingState] = useState<LiveMeetingState>(createLiveMeetingState());
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Sync refs with state to avoid stale closures
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Sync apiKey ref with options to prevent stale closure
  useEffect(() => {
    apiKeyRef.current = options.apiKey;
  }, [options.apiKey]);

  // Periodic cleanup every 5 minutes during recording
  useEffect(() => {
    if (!isRecording) return;

    const cleanupInterval = setInterval(() => {
      // Trigger garbage collection hint (if available in dev tools)
      if (typeof window !== 'undefined' && 'gc' in window) {
        (window as unknown as { gc: () => void }).gc();
      }
      console.debug('[Memory] Periodic cleanup triggered', {
        segments: meetingState.segments.length,
        keywordMatches: meetingState.keywordMatches.size,
        pendingRequests: transcribeAbortControllersRef.current.size,
      });
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [isRecording, meetingState.segments.length, meetingState.keywordMatches.size]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Fix C5: Abort ALL pending transcription requests
      transcribeAbortControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      transcribeAbortControllersRef.current.clear();

      if (chunkerRef.current) {
        chunkerRef.current.stop();
      }
      if (vadRef.current) {
        vadRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      // Stop audio recorder on unmount
      if (audioRecorderRef.current?.isRecording()) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
    };
  }, []);

  // Process retry queue - called after each request completes
  const processRetryQueue = useCallback(() => {
    if (isProcessingRetryQueueRef.current) return;
    if (retryQueueRef.current.length === 0) return;
    if (transcribeAbortControllersRef.current.size >= MAX_CONCURRENT_REQUESTS) return;
    if (!handleChunkRef.current) return;

    isProcessingRetryQueueRef.current = true;

    // Process up to MAX_CONCURRENT_REQUESTS - current pending
    const slotsAvailable = MAX_CONCURRENT_REQUESTS - transcribeAbortControllersRef.current.size;
    const chunksToProcess = retryQueueRef.current.splice(0, slotsAvailable);

    for (const chunk of chunksToProcess) {
      console.debug('[Whisper] Processing queued chunk', {
        chunkId: chunk.id,
        queueRemaining: retryQueueRef.current.length,
      });
      // Process asynchronously using the handleChunk ref (includes segment processing)
      void handleChunkRef.current(chunk);
    }

    isProcessingRetryQueueRef.current = false;
  }, []);

  // Internal transcribe function (used by both direct calls and retry queue)
  const transcribeChunkInternal = useCallback(async (chunk: AudioChunk): Promise<TranscriptSegment | null> => {
    // Rate limiting: Queue chunk if too many concurrent requests
    if (transcribeAbortControllersRef.current.size >= MAX_CONCURRENT_REQUESTS) {
      console.debug('[Whisper] Rate limit - queueing chunk for retry', {
        current: transcribeAbortControllersRef.current.size,
        max: MAX_CONCURRENT_REQUESTS,
        queuedChunkId: chunk.id,
        queueLength: retryQueueRef.current.length + 1,
      });
      retryQueueRef.current.push(chunk);
      return null; // Will be processed from retry queue
    }

    // Fix W1: Validate chunk before API call
    const MIN_BLOB_SIZE = 4000; // ~4KB minimum for valid audio

    if (!chunk.blob || chunk.blob.size < MIN_BLOB_SIZE) {
      console.debug('[Whisper] Chunk übersprungen - zu klein:', {
        id: chunk.id,
        size: chunk.blob?.size || 0,
        minRequired: MIN_BLOB_SIZE,
      });
      return null;
    }

    // Fix W2: Validate API key before making request
    if (!apiKeyRef.current) {
      console.error('[Whisper] Kein API-Key verfügbar');
      setError('OpenAI API-Key fehlt');
      return null;
    }

    // Silence Pre-Filter: Skip chunks with >70% silence to save API costs
    const silenceRatio = await analyzeSilenceRatio(chunk.blob);
    if (silenceRatio > MAX_SILENCE_RATIO) {
      console.debug('[Whisper] Skipping chunk - high silence ratio:', {
        id: chunk.id,
        silenceRatio: `${(silenceRatio * 100).toFixed(1)}%`,
        threshold: `${(MAX_SILENCE_RATIO * 100).toFixed(0)}%`,
      });
      return null;
    }

    // Fix C5: Create AbortController for this specific request and store in Map
    const abortController = new AbortController();
    transcribeAbortControllersRef.current.set(chunk.id, abortController);

    // Fix H1: Add timeout for Whisper API (180s - increased from 120s for longer chunks)
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 180000);

    try {
      setPendingChunks(prev => prev + 1);
      setIsProcessing(true);

      // Try to convert audio to WAV for better compatibility
      // Falls back to original blob if conversion fails (e.g., Safari MP4 chunks)
      let audioBlob = chunk.blob;
      try {
        audioBlob = await convertAudioToWav(chunk.blob);
      } catch (conversionError) {
        // Conversion failed (likely incomplete MP4 fragment from Safari)
        // Fall back to original blob - Whisper may still accept it
        console.debug('[Whisper] Audio conversion failed, using original blob:', {
          error: conversionError instanceof Error ? conversionError.message : 'Unknown error',
          blobType: chunk.blob.type,
          blobSize: chunk.blob.size,
        });
      }
      const formData = createWhisperFormData(audioBlob, opts.language);

      const response = await fetch(opts.apiEndpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKeyRef.current}` },
        body: formData,
        signal: abortController.signal, // Add abort signal
      });

      if (!response.ok) {
        // Fix W3: Read response body for detailed error info
        const errorBody = await response.text().catch(() => 'Unable to read error body');
        console.error('[Whisper] API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          chunkId: chunk.id,
          blobSize: chunk.blob.size,
          blobType: chunk.blob.type,
        });
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      const text = result.text?.trim();

      if (!text) {
        return null;
      }

      // Fix H1: Hallucination filter - check before creating segment
      // Get confidence early for hallucination check
      const rawConfidence = typeof result.confidence === 'number' && !isNaN(result.confidence)
        ? result.confidence
        : 0.9;

      if (isLikelyHallucination(text, rawConfidence)) {
        console.debug('[Whisper] Skipping hallucination:', {
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          confidence: rawConfidence,
        });
        return null;
      }

      // Use the already validated confidence value
      const confidence = rawConfidence;

      const segment: TranscriptSegment = {
        id: chunk.id,
        text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        speakerId: null, // Will be assigned by diarization
        confidence,
        confirmed: false,
      };

      return segment;
    } catch (err) {
      // Don't report abort errors - they're expected on unmount or timeout
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      const errorMessage = err instanceof Error ? err.message : 'Transcription failed';
      setError(errorMessage);
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
      return null;
    } finally {
      // Fix C5: Remove this request's controller from Map
      clearTimeout(timeoutId);
      transcribeAbortControllersRef.current.delete(chunk.id);

      setPendingChunks(prev => {
        const newCount = Math.max(0, prev - 1);
        // Update isProcessing based on the NEW count (not stale closure)
        setIsProcessing(newCount > 0);
        return newCount;
      });

      // Process retry queue after each completed request
      void processRetryQueue();
    }
  }, [opts.apiEndpoint, opts.language, options, processRetryQueue]); // apiKeyRef.current used via ref, not in deps

  // Process transcribed segment
  const processTranscribedSegment = useCallback((segment: TranscriptSegment) => {
    setMeetingState(prev => {
      const newState = processSegment(prev, segment, opts.keywordCategories);

      // Check for new decisions
      const lastDecision = newState.decisions[newState.decisions.length - 1];
      if (lastDecision && !prev.decisions.includes(lastDecision)) {
        options.onDecision?.(lastDecision);
      }

      // Check for new questions
      const newQuestions = newState.questions.slice(prev.questions.length);
      for (const question of newQuestions) {
        options.onQuestion?.(question);
      }

      return newState;
    });

    options.onSegment?.(segment);
  }, [opts.keywordCategories, options]);

  // Alias for backward compatibility
  const transcribeChunk = transcribeChunkInternal;

  // Handle chunk ready
  const handleChunk = useCallback(async (chunk: AudioChunk) => {
    const segment = await transcribeChunk(chunk);
    if (segment) {
      processTranscribedSegment(segment);
    }
  }, [transcribeChunk, processTranscribedSegment]);

  // Sync handleChunk ref for retry queue processing
  useEffect(() => {
    handleChunkRef.current = handleChunk;
  }, [handleChunk]);

  // Start recording
  const start = useCallback(async () => {
    if (isRecording) return;

    try {
      setError(null);

      // Get audio stream
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Start parallel audio recorder for complete recording
      audioRecorderRef.current = new AudioRecorder({
        onError: (err) => {
          console.error('[LiveTranscript] AudioRecorder error:', err);
        },
      });
      await audioRecorderRef.current.start();
      recordingStartTimeRef.current = Date.now();

      // Initialize VAD
      vadRef.current = new VoiceActivityDetector({
        onAudioLevel: setAudioLevel,
        onSpeechStart: () => setIsSpeaking(true),
        onSpeechEnd: () => setIsSpeaking(false),
      });
      await vadRef.current.start(streamRef.current);

      // Initialize chunker
      if (opts.useSmartChunking) {
        chunkerRef.current = new SmartAudioChunker({
          chunkDuration: opts.chunkDuration,
          onChunk: handleChunk,
          onError: (err) => {
            setError(err.message);
            options.onError?.(err);
          },
        });
      } else {
        chunkerRef.current = new AudioChunker({
          chunkDuration: opts.chunkDuration,
          onChunk: handleChunk,
          onError: (err) => {
            setError(err.message);
            options.onError?.(err);
          },
        });
      }
      await chunkerRef.current.start(streamRef.current);

      // Fix H20: Clear any existing interval before starting new one
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      // Start duration tracking (use ref to avoid stale closure)
      startTimeRef.current = performance.now();
      durationIntervalRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          const newDuration = performance.now() - startTimeRef.current;
          durationRef.current = newDuration;
          setDuration(newDuration);
        }
      }, 100);

      setIsRecording(true);
      setMeetingState(prev => ({ ...prev, isRecording: true }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [isRecording, opts.useSmartChunking, opts.chunkDuration, handleChunk, options]);

  // Stop recording
  const stop = useCallback(async (): Promise<StopResult | undefined> => {
    if (!isRecording) return;

    // Stop duration tracking FIRST and capture final duration
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    const finalDuration = durationRef.current; // Use ref for current value

    // Stop chunker and get final chunk
    if (chunkerRef.current) {
      const finalChunk = await chunkerRef.current.stop();
      if (finalChunk) {
        await handleChunk(finalChunk);
      }
      chunkerRef.current = null;
    }

    // Stop VAD
    if (vadRef.current) {
      vadRef.current.stop();
      vadRef.current = null;
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Stop parallel audio recorder and get complete blob
    let audioBlob: Blob | null = null;
    let audioDuration = 0;
    let audioMimeType = 'audio/webm';

    if (audioRecorderRef.current?.isRecording()) {
      const recordingResult = await audioRecorderRef.current.stop();
      audioBlob = recordingResult.blob;
      audioMimeType = recordingResult.mimeType;
      audioDuration = Date.now() - recordingStartTimeRef.current;
      audioRecorderRef.current = null;
    }

    setIsRecording(false);
    setIsSpeaking(false);
    setAudioLevel(0);
    setMeetingState(prev => ({ ...prev, isRecording: false, duration: finalDuration }));

    return {
      audioBlob,
      audioMimeType,
      audioDuration,
    };
  }, [isRecording, handleChunk]);

  // Pause recording
  const pause = useCallback(() => {
    if (!isRecording || isPaused) return;
    setIsPaused(true);
    setMeetingState(prev => ({ ...prev, isPaused: true }));
  }, [isRecording, isPaused]);

  // Resume recording
  const resume = useCallback(() => {
    if (!isRecording || !isPaused) return;
    setIsPaused(false);
    setMeetingState(prev => ({ ...prev, isPaused: false }));
  }, [isRecording, isPaused]);

  // Force emit current chunk
  const forceEmit = useCallback(async () => {
    if (chunkerRef.current?.isActive()) {
      await chunkerRef.current.forceEmit();
    }
  }, []);

  // Get current stats
  const stats = getLiveMeetingStats(meetingState, opts.keywordCategories);

  // Reset state
  const reset = useCallback(() => {
    setMeetingState(createLiveMeetingState());
    setDuration(0);
    setError(null);
  }, []);

  return {
    // State
    isRecording,
    isPaused,
    isProcessing,
    duration,
    segments: meetingState.segments,
    pendingChunks,
    audioLevel,
    isSpeaking,
    stats,
    decisions: meetingState.decisions,
    questions: meetingState.questions,
    keywordMatches: meetingState.keywordMatches,
    error,

    // Actions
    start,
    stop,
    pause,
    resume,
    forceEmit,
    reset,

    // Full state access
    meetingState,
  };
}

export type UseLiveTranscriptReturn = ReturnType<typeof useLiveTranscript>;
