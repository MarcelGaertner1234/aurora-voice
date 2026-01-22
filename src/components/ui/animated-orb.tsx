'use client';

import { motion } from 'framer-motion';
import { Mic, MicOff, Loader2, Pause } from 'lucide-react';
import type { RecordingState } from '@/types';

interface AnimatedOrbProps {
  state: RecordingState;
  audioLevel?: number;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: {
    outer: 'h-16 w-16',
    inner: 'h-12 w-12',
    icon: 'h-5 w-5',
  },
  md: {
    outer: 'h-24 w-24',
    inner: 'h-18 w-18',
    icon: 'h-8 w-8',
  },
  lg: {
    outer: 'h-32 w-32',
    inner: 'h-24 w-24',
    icon: 'h-10 w-10',
  },
};

const stateColors = {
  idle: 'from-primary to-secondary',
  recording: 'from-error to-warning',
  paused: 'from-warning to-amber-400',
  processing: 'from-secondary to-primary',
  transcribing: 'from-primary to-success',
  enriching: 'from-success to-primary',
};

const stateLabels = {
  idle: 'Klicken oder Hotkey zum Aufnehmen',
  recording: 'Aufnahme läuft...',
  paused: 'Pausiert - Klicken zum Fortsetzen',
  processing: 'Verarbeitung...',
  transcribing: 'Transkribiere...',
  enriching: 'Analysiere...',
};

export function AnimatedOrb({ state, audioLevel = 0, onClick, disabled, size = 'lg' }: AnimatedOrbProps) {
  const isRecording = state === 'recording';
  const isPaused = state === 'paused';
  const isProcessing = state === 'processing' || state === 'transcribing' || state === 'enriching';
  const sizes = sizeConfig[size];

  // Scale based on audio level when recording
  const scale = isRecording ? 1 + audioLevel * 0.8 : 1;

  return (
    <div className={`flex flex-col items-center ${size === 'sm' ? 'gap-2' : 'gap-6'}`}>
      <motion.button
        onClick={onClick}
        disabled={disabled || isProcessing}
        className={`
          relative flex ${sizes.outer} items-center justify-center rounded-full
          bg-gradient-to-br ${stateColors[state]}
          shadow-lg transition-shadow
          ${isRecording ? 'orb-recording shadow-error/30' : isPaused ? 'shadow-warning/30' : isProcessing ? '' : 'orb-idle hover:shadow-xl'}
          disabled:cursor-not-allowed disabled:opacity-50
        `}
        animate={{ scale }}
        transition={{ type: 'tween', duration: 0.1, ease: 'easeOut' }}
        whileHover={!isProcessing && !isRecording && !isPaused ? { scale: 1.05 } : undefined}
        whileTap={!isProcessing ? { scale: 0.95 } : undefined}
      >
        {/* Glow Effect */}
        <motion.div
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${stateColors[state]} blur-xl`}
          animate={{
            opacity: isRecording ? [0.4, 0.6, 0.4] : isPaused ? [0.3, 0.5, 0.3] : 0.3,
            scale: isRecording ? [1, 1.1, 1] : isPaused ? [1, 1.05, 1] : 1,
          }}
          transition={{
            duration: isRecording ? 1.5 : isPaused ? 2.5 : 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Inner Circle */}
        <motion.div
          className={`relative z-10 flex ${sizes.inner} items-center justify-center rounded-full bg-white/20 backdrop-blur-sm`}
          animate={{
            scale: isRecording ? [1, 1.05, 1] : isPaused ? [1, 1.02, 1] : 1,
          }}
          transition={{
            duration: isRecording ? 1 : isPaused ? 2 : 0,
            repeat: isRecording || isPaused ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {isProcessing ? (
            <Loader2 className={`${sizes.icon} animate-spin text-white`} />
          ) : isPaused ? (
            <Pause className={`${sizes.icon} text-white`} />
          ) : isRecording ? (
            <MicOff className={`${sizes.icon} text-white`} />
          ) : (
            <Mic className={`${sizes.icon} text-white`} />
          )}
        </motion.div>

        {/* Audio Level Ring */}
        {isRecording && (
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-white/30"
            animate={{
              scale: 1 + audioLevel * 1.2,
              opacity: 0.3 + audioLevel * 0.5,
            }}
            transition={{
              type: 'tween',
              duration: 0.1,
              ease: 'easeOut',
            }}
          />
        )}
      </motion.button>

      {/* Status Text - only show for larger sizes */}
      {size !== 'sm' && (
        <motion.p
          className="text-center text-sm text-foreground-secondary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          key={state}
        >
          {stateLabels[state]}
        </motion.p>
      )}

      {/* Hotkey Hint - only show for larger sizes */}
      {size !== 'sm' && state === 'idle' && (
        <motion.div
          className="flex items-center gap-2 rounded-full bg-background-secondary px-4 py-2 text-xs text-foreground-secondary"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <kbd className="rounded bg-foreground/10 px-2 py-0.5 font-mono text-xs">⌘</kbd>
          <span>+</span>
          <kbd className="rounded bg-foreground/10 px-2 py-0.5 font-mono text-xs">⇧</kbd>
          <span>+</span>
          <kbd className="rounded bg-foreground/10 px-2 py-0.5 font-mono text-xs">Space</kbd>
        </motion.div>
      )}
    </div>
  );
}
