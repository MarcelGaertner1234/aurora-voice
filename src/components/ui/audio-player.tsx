'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Download, Volume2, VolumeX, Trash2 } from 'lucide-react';
import type { MeetingRecording } from '@/types/meeting';
import { logger } from '@/lib/utils/logger';

interface AudioPlayerProps {
  recording: MeetingRecording;
  onDownload?: () => void;
  onDelete?: () => void;
}

function formatDuration(durationValue: number): string {
  const ms = normalizeDuration(durationValue);
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Durations werden jetzt immer in Millisekunden gespeichert
// Threshold auf 1000 reduzieren (1 Sekunde) für seltene Edge-Cases
function normalizeDuration(durationValue: number): number {
  return durationValue < 1000 ? durationValue * 1000 : durationValue;
}

export function AudioPlayer({ recording, onDownload, onDelete }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Check if the audio format can be played by this browser
  const canPlayType = useMemo(() => {
    if (!recording.blob) return false;

    const audio = document.createElement('audio');
    const mimeType = recording.mimeType || recording.blob.type;
    const canPlay = audio.canPlayType(mimeType);

    logger.debug('Playback compatibility check:', {
      mimeType,
      blobType: recording.blob.type,
      canPlay,
    });

    return canPlay !== '';
  }, [recording.blob, recording.mimeType]);

  // Create object URL for the blob using useMemo to avoid effect
  // Validate that blob exists and has content
  const audioUrl = useMemo(() => {
    // Prefer Data URL (works in WebKit/Tauri without createObjectURL issues)
    if (recording.dataUrl) {
      logger.debug('AudioPlayer: Using dataUrl for playback');
      return recording.dataUrl;
    }

    // Fallback to blob URL (for non-WebKit browsers or fresh recordings)
    if (recording.blob && recording.blob.size > 0) {
      logger.debug('AudioPlayer: Creating URL for blob', {
        size: recording.blob.size,
        type: recording.blob.type,
        mimeType: recording.mimeType,
      });
      return URL.createObjectURL(recording.blob);
    }
    logger.warn('AudioPlayer: Invalid or empty blob', {
      hasBlob: !!recording.blob,
      size: recording.blob?.size,
    });
    return null;
  }, [recording.dataUrl, recording.blob, recording.mimeType]);

  // Reset state when audioUrl changes and cleanup on unmount
  useEffect(() => {
    // Reset state when a new audio URL is set
    setIsLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);

    // Check format compatibility early and set error if not supported
    if (recording.blob && !canPlayType) {
      const mimeType = recording.mimeType || recording.blob.type;
      logger.warn('Audio format not supported for playback:', mimeType);
      setAudioError(
        mimeType.includes('webm')
          ? 'Aufnahme konnte nicht konvertiert werden. Bitte löschen und neu aufnehmen.'
          : 'Audio-Format nicht unterstützt'
      );
    } else {
      setAudioError(null);
    }

    return () => {
      // Only revoke blob URLs, not data URLs
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl, canPlayType, recording.blob, recording.mimeType]);

  // Fallback: If canPlay/loadedMetadata doesn't fire within 2s, enable anyway
  useEffect(() => {
    if (audioUrl && !isLoaded && canPlayType && !audioError) {
      const timeout = setTimeout(() => {
        if (audioRef.current) {
          // Check readyState as additional validation
          const ready = audioRef.current.readyState >= 1; // HAVE_METADATA
          const hasDuration = audioRef.current.duration > 0 && isFinite(audioRef.current.duration);
          logger.debug('AudioPlayer: Timeout fallback, readyState:', audioRef.current.readyState, 'duration:', audioRef.current.duration);
          // Fix: Use stricter condition - require BOTH ready state AND valid duration
          if (ready && hasDuration) {
            logger.debug('AudioPlayer: Enabling playback via timeout fallback');
            setIsLoaded(true);
          }
        }
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [audioUrl, isLoaded, canPlayType, audioError]);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  // Handle duration change
  const handleDurationChange = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  // Handle play/pause
  const togglePlayPause = useCallback(async () => {
    if (!audioRef.current || !isLoaded) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        logger.error('Failed to play audio:', err);
        setAudioError('Audio kann nicht abgespielt werden');
        setIsPlaying(false);
      }
    }
  }, [isPlaying, isLoaded]);

  // Handle seek
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (!recording.blob) return;

    const url = URL.createObjectURL(recording.blob);
    const a = document.createElement('a');
    a.href = url;

    // Determine file extension from mimeType
    const extension = recording.mimeType.includes('wav') ? 'wav'
      : recording.mimeType.includes('mp4') ? 'm4a'
      : recording.mimeType.includes('aac') ? 'aac'
      : recording.mimeType.includes('webm') ? 'webm'
      : recording.mimeType.includes('ogg') ? 'ogg'
      : recording.mimeType.includes('mp3') ? 'mp3'
      : 'audio';

    a.download = `recording-${recording.id.slice(0, 8)}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onDownload?.();
  }, [recording, onDownload]);

  // Handle audio ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Handle audio can play (loaded successfully)
  const handleCanPlay = useCallback(() => {
    setIsLoaded(true);
    setAudioError(null);
  }, []);

  // Handle audio error with specific MediaError messages
  const handleError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audioElement = e.currentTarget;
    const mediaError = audioElement.error;

    // Only log and show error if we have a valid blob but it failed to load
    // Ignore errors for empty/missing blobs as those are handled elsewhere
    if (recording.blob && recording.blob.size > 0) {
      let errorMessage = 'Audio-Datei konnte nicht geladen werden';

      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Wiedergabe abgebrochen';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Netzwerkfehler beim Laden';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Audio-Format nicht unterstützt';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Audio-Format nicht unterstützt';
            break;
        }
      }

      logger.warn('Audio playback error:', {
        code: mediaError?.code,
        message: mediaError?.message,
        blobSize: recording.blob.size,
        blobType: recording.blob.type,
        mimeType: recording.mimeType,
      });

      setIsLoaded(false);
      setAudioError(errorMessage);
    }
  }, [recording.blob, recording.mimeType]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Show placeholder if no valid audio
  if (!audioUrl) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-background p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground-secondary">
          <Play className="h-4 w-4 ml-0.5" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-1.5 w-full rounded-full bg-foreground/10" />
          <div className="flex justify-between text-xs text-foreground-secondary">
            <span>0:00</span>
            <span>{formatTime(normalizeDuration(recording.duration) / 1000)}</span>
          </div>
          <span className="text-xs text-foreground-secondary">Audio wird geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg bg-background p-3">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onLoadedMetadata={handleCanPlay}
        onCanPlay={handleCanPlay}
        onError={handleError}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Play/Pause button */}
      <button
        onClick={togglePlayPause}
        disabled={!isLoaded || !!audioError}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </button>

      {/* Progress bar and time */}
      <div className="flex flex-1 flex-col gap-1">
        {/* Progress bar */}
        <div
          onClick={handleSeek}
          className="h-1.5 w-full cursor-pointer rounded-full bg-foreground/10"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time display */}
        <div className="flex justify-between text-xs text-foreground-secondary">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration || normalizeDuration(recording.duration) / 1000)}</span>
        </div>

        {/* Error display with delete option for incompatible formats */}
        {audioError && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500">{audioError}</span>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-red-500 hover:text-red-400 underline"
                title="Inkompatible Aufnahme löschen"
              >
                Löschen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mute button */}
      <button
        onClick={toggleMute}
        className="p-1.5 text-foreground-secondary hover:text-foreground transition-colors"
        title={isMuted ? 'Ton ein' : 'Ton aus'}
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </button>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!recording.blob}
        className="p-1.5 text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-50"
        title="Aufnahme herunterladen"
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

// Compact version for lists
interface AudioPlayerCompactProps {
  recording: MeetingRecording;
  index: number;
  onDownload?: () => void;
  onDelete?: () => void;
}

export function AudioPlayerCompact({ recording, index, onDownload, onDelete }: AudioPlayerCompactProps) {
  const createdDate = new Date(recording.createdAt);
  const formattedDateTime = createdDate.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ', ' + createdDate.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-foreground-secondary">
        <span className="font-medium">Aufnahme {index + 1}</span>
        <span>{formattedDateTime} - {formatDuration(recording.duration)}</span>
      </div>
      <AudioPlayer recording={recording} onDownload={onDownload} onDelete={onDelete} />
    </div>
  );
}
