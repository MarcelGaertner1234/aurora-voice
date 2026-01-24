'use client';

import { motion } from 'framer-motion';
import { Check, Mic, Sparkles, FileText } from 'lucide-react';
import type { StepProps } from '@/hooks/use-onboarding';

export function ReadyStep({ onComplete }: StepProps) {
  return (
    <div className="text-center space-y-6">
      {/* Success Animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="mx-auto w-24 h-24 rounded-full bg-success/20 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Check className="w-12 h-12 text-success" />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-2xl font-bold text-foreground">Alles bereit!</h2>
        <p className="mt-2 text-foreground-secondary">
          Du kannst jetzt deine erste Aufnahme starten.
        </p>
      </motion.div>

      {/* Quick Start Guide */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl bg-background-secondary p-5 text-left"
      >
        <h3 className="font-medium text-foreground mb-4">Quick Start:</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              1
            </div>
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-foreground-secondary" />
              <span className="text-sm text-foreground-secondary">
                Klicke auf den Aufnahme-Button
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              2
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-foreground-secondary" />
              <span className="text-sm text-foreground-secondary">
                Sprich oder lass Audio abspielen
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              3
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-foreground-secondary" />
              <span className="text-sm text-foreground-secondary">
                Erhalte automatisch eine Zusammenfassung
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tip */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="text-xs text-foreground-secondary"
      >
        Tipp: Du kannst jederzeit in den Einstellungen Änderungen vornehmen.
      </motion.p>

      {/* CTA Button */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        onClick={onComplete}
        className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-secondary text-white font-medium transition-all hover:opacity-90 hover:scale-[1.02]"
      >
        Erste Aufnahme starten
      </motion.button>
    </div>
  );
}
