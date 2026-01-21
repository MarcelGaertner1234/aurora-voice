'use client';

import { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, Check } from 'lucide-react';
import type { SpeakerProfile } from '@/types/speaker';

interface ParticipantSelectorProps {
  speakers: SpeakerProfile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function ParticipantSelector({
  speakers,
  selected,
  onChange,
  disabled,
}: ParticipantSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const toggleParticipant = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectedCount = selected.length;
  const buttonText = selectedCount > 0
    ? `${selectedCount} Teilnehmer`
    : 'Teilnehmer (optional)';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex w-full items-center justify-between gap-2
          rounded-lg bg-background-secondary px-4 py-2.5
          text-sm text-foreground-secondary
          transition-colors
          hover:bg-foreground/5
          disabled:cursor-not-allowed disabled:opacity-50
          ${isOpen ? 'ring-1 ring-primary/50' : ''}
        `}
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>{buttonText}</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && speakers.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-lg border border-foreground/10 bg-background shadow-lg">
          <div className="max-h-48 overflow-y-auto p-1">
            {speakers.map((speaker) => {
              const isSelected = selected.includes(speaker.id);
              return (
                <label
                  key={speaker.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-foreground/5"
                >
                  <div
                    className={`
                      flex h-4 w-4 items-center justify-center rounded border
                      transition-colors
                      ${isSelected
                        ? 'border-primary bg-primary'
                        : 'border-foreground/20 bg-transparent'
                      }
                    `}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleParticipant(speaker.id)}
                    className="sr-only"
                  />
                  <span
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: speaker.color }}
                    />
                    {speaker.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {isOpen && speakers.length === 0 && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-lg border border-foreground/10 bg-background p-3 shadow-lg">
          <p className="text-center text-xs text-foreground-secondary">
            Keine Teilnehmer vorhanden
          </p>
        </div>
      )}
    </div>
  );
}
