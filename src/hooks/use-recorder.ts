'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { AudioRecorder } from '@/lib/audio/recorder';
import { useAppStore } from '@/lib/store/settings';

export function useRecorder() {
  const recorderRef = useRef<AudioRecorder | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const { setRecordingState, setAudioLevel, setError } = useAppStore();

  // Fix: Ref für stabilen Callback - verhindert Stale Closure Problem
  const setAudioLevelRef = useRef(setAudioLevel);
  useEffect(() => {
    setAudioLevelRef.current = setAudioLevel;
  }, [setAudioLevel]);

  // Fix H11: Added setIsSupported to dependencies (state setter is stable but for completeness)
  const checkSupport = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setIsSupported(false);
      setError('Audio recording is not supported in this browser');
      return false;
    }
    return true;
  }, [setError, setIsSupported]);

  const startRecording = useCallback(async () => {
    // Fix M17: Clear any previous error at the start of a new recording attempt
    setError(null);

    if (!checkSupport()) return;

    try {
      recorderRef.current = new AudioRecorder({
        onAudioLevel: (level) => {
          setAudioLevelRef.current(level);
        },
        onError: (error) => {
          setError(error.message);
          setRecordingState('idle');
        },
      });

      await recorderRef.current.start();
      setRecordingState('recording');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to start recording';

      if (message.includes('Permission denied')) {
        setError('Microphone access was denied. Please allow microphone access in your browser settings.');
      } else {
        setError(message);
      }

      setRecordingState('idle');
    }
  }, [checkSupport, setError, setRecordingState]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (!recorderRef.current) return null;

    try {
      setRecordingState('processing');
      const result = await recorderRef.current.stop();
      recorderRef.current = null;
      // Return the converted blob (with correct mimeType already set)
      return result.blob;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to stop recording';
      setError(message);
      setRecordingState('idle');
      return null;
    }
  }, [setError, setRecordingState]);

  const toggleRecording = useCallback(async (): Promise<Blob | null> => {
    if (recorderRef.current?.isRecording()) {
      return stopRecording();
    } else {
      await startRecording();
      return null;
    }
  }, [startRecording, stopRecording]);

  return {
    startRecording,
    stopRecording,
    toggleRecording,
    isSupported,
    isRecording: recorderRef.current?.isRecording() ?? false,
  };
}
