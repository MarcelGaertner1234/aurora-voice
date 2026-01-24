'use client';

import { motion } from 'framer-motion';
import { Mic, Sparkles, Shield, Zap } from 'lucide-react';
import type { StepProps } from '@/hooks/use-onboarding';

export function WelcomeStep({ onNext, onSkip }: StepProps) {
  return (
    <div className="text-center space-y-6">
      {/* Logo Animation */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
      >
        <Mic className="w-12 h-12 text-white" />
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-3xl font-bold text-foreground">
          Willkommen bei Aurora
        </h1>
        <p className="mt-2 text-foreground-secondary">
          Dein KI-gestützter Meeting-Assistent
        </p>
      </motion.div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-3 gap-4 pt-4"
      >
        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background-secondary">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-xs text-foreground-secondary">KI-Zusammenfassung</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background-secondary">
          <Zap className="h-6 w-6 text-warning" />
          <span className="text-xs text-foreground-secondary">Live-Transkription</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background-secondary">
          <Shield className="h-6 w-6 text-success" />
          <span className="text-xs text-foreground-secondary">Privacy-First</span>
        </div>
      </motion.div>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-sm text-foreground-secondary"
      >
        Lass uns in 2 Minuten alles einrichten.
      </motion.p>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex gap-4 justify-center pt-4"
      >
        <button
          onClick={onSkip}
          className="px-6 py-2.5 rounded-full text-sm text-foreground-secondary transition-colors hover:text-foreground"
        >
          Überspringen
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-medium transition-all hover:bg-primary/90 hover:scale-105"
        >
          Los geht's
        </button>
      </motion.div>
    </div>
  );
}
