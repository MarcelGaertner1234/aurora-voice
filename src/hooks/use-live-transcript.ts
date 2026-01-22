'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { AudioChunker, SmartAudioChunker, type AudioChunk } from '@/lib/audio/chunker';
import { VoiceActivityDetector, type VADState } from '@/lib/audio/vad';
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

const DEFAULT_OPTIONS: Required<Omit<UseLiveTranscriptOptions, 'onSegment' | 'onDecision' | 'onQuestion' | 'onError' | 'apiKey'>> = {
  apiEndpoint: 'https://api.openai.com/v1/audio/transcriptions',
  language: 'de',
  chunkDuration: 5000,
  useSmartChunking: true,
  keywordCategories: DEFAULT_KEYWORD_CATEGORIES,
};

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
  const isPausedRef = useRef(false); // Track isPaused without stale closure
  const durationRef = useRef(0); // Track duration without stale closure
  const apiKeyRef = useRef(options.apiKey); // Track apiKey without stale closure

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
    };
  }, []);

  // Transcribe audio chunk with abort support
  // Fix C5: Use Map to track each request's AbortController independently
  const transcribeChunk = useCallback(async (chunk: AudioChunk): Promise<TranscriptSegment | null> => {
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

    // Fix C5: Create AbortController for this specific request and store in Map
    const abortController = new AbortController();
    transcribeAbortControllersRef.current.set(chunk.id, abortController);

    // Fix H1: Add timeout for Whisper API (120s)
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 120000);

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

      // Fix H3: Validate confidence value
      const confidence = typeof result.confidence === 'number' && !isNaN(result.confidence)
        ? result.confidence
        : 0.9;

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
    }
  }, [opts.apiEndpoint, opts.language, options]); // apiKeyRef.current used via ref, not in deps

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

  // Handle chunk ready
  const handleChunk = useCallback(async (chunk: AudioChunk) => {
    const segment = await transcribeChunk(chunk);
    if (segment) {
      processTranscribedSegment(segment);
    }
  }, [transcribeChunk, processTranscribedSegment]);

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
  const stop = useCallback(async () => {
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

    setIsRecording(false);
    setIsSpeaking(false);
    setAudioLevel(0);
    setMeetingState(prev => ({ ...prev, isRecording: false, duration: finalDuration }));
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
