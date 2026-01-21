'use client';

import { User, HelpCircle } from 'lucide-react';
import type { SpeakerProfile } from '@/types/speaker';

interface SpeakerLabelProps {
  speakerId: string | null;
  suggestedSpeakerId?: string;
  speakers: SpeakerProfile[];
  confirmed: boolean;
  showSuggestion?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

export function SpeakerLabel({
  speakerId,
  suggestedSpeakerId,
  speakers,
  confirmed,
  showSuggestion = true,
  size = 'sm',
  onClick,
}: SpeakerLabelProps) {
  // Find speaker
  const speaker = speakerId
    ? speakers.find((s) => s.id === speakerId)
    : undefined;

  const suggestedSpeaker = suggestedSpeakerId
    ? speakers.find((s) => s.id === suggestedSpeakerId)
    : undefined;

  // Determine what to display
  const displaySpeaker = speaker || (showSuggestion ? suggestedSpeaker : undefined);
  const isSuggestion = !speaker && !!suggestedSpeaker && showSuggestion;

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-sm gap-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
  };

  // Render unknown speaker
  if (!displaySpeaker) {
    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`inline-flex items-center rounded-full bg-foreground/10 text-foreground-secondary transition-colors ${
          onClick ? 'hover:bg-foreground/20 cursor-pointer' : 'cursor-default'
        } ${sizeClasses[size]}`}
      >
        <User className={iconSizes[size]} />
        <span>Unbekannt</span>
        {onClick && <HelpCircle className={`${iconSizes[size]} opacity-50`} />}
      </button>
    );
  }

  // Render speaker label
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center rounded-full font-medium transition-colors ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      } ${sizeClasses[size]} ${
        isSuggestion
          ? 'border border-dashed'
          : ''
      }`}
      style={{
        backgroundColor: isSuggestion ? 'transparent' : `${displaySpeaker.color}20`,
        color: displaySpeaker.color,
        borderColor: isSuggestion ? displaySpeaker.color : 'transparent',
      }}
    >
      <span
        className={`rounded-full ${iconSizes[size]}`}
        style={{ backgroundColor: displaySpeaker.color }}
      />
      <span>{displaySpeaker.name}</span>
      {isSuggestion && <span className="opacity-60">?</span>}
    </button>
  );
}

// Inline speaker indicator (minimal version)
interface SpeakerIndicatorProps {
  speakerId: string | null;
  speakers: SpeakerProfile[];
}

export function SpeakerIndicator({ speakerId, speakers }: SpeakerIndicatorProps) {
  const speaker = speakerId
    ? speakers.find((s) => s.id === speakerId)
    : undefined;

  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: speaker?.color || '#9CA3AF' }}
      title={speaker?.name || 'Unbekannt'}
    />
  );
}

// Speaker color dot
interface SpeakerDotProps {
  color: string;
  size?: 'xs' | 'sm' | 'md';
  title?: string;
}

export function SpeakerDot({ color, size = 'sm', title }: SpeakerDotProps) {
  const sizeClasses = {
    xs: 'h-2 w-2',
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
  };

  return (
    <span
      className={`inline-block rounded-full ${sizeClasses[size]}`}
      style={{ backgroundColor: color }}
      title={title}
    />
  );
}

// Speaker list for selection
interface SpeakerListItemProps {
  speaker: SpeakerProfile;
  selected?: boolean;
  onClick: () => void;
}

export function SpeakerListItem({ speaker, selected, onClick }: SpeakerListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-left transition-colors ${
        selected
          ? 'bg-primary/10 ring-1 ring-primary'
          : 'hover:bg-foreground/5'
      }`}
    >
      <SpeakerDot color={speaker.color} size="md" />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{speaker.name}</p>
        {speaker.email && (
          <p className="truncate text-xs text-foreground-secondary">{speaker.email}</p>
        )}
      </div>
      {selected && (
        <span className="flex-shrink-0 text-primary">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}
    </button>
  );
}

// Speaker stats display
interface SpeakerStatsProps {
  speaker: SpeakerProfile;
  speakingTime?: number; // ms
  segmentCount?: number;
}

export function SpeakerStats({ speaker, speakingTime, segmentCount }: SpeakerStatsProps) {
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] bg-foreground/5 p-3">
      <SpeakerDot color={speaker.color} size="md" />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{speaker.name}</p>
        <div className="flex gap-3 text-xs text-foreground-secondary">
          {speakingTime !== undefined && (
            <span>{formatTime(speakingTime)} Sprechzeit</span>
          )}
          {segmentCount !== undefined && (
            <span>{segmentCount} Segmente</span>
          )}
          <span>{speaker.meetingCount} Meetings</span>
        </div>
      </div>
    </div>
  );
}
