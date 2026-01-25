'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Mic } from 'lucide-react';

export function PodcastSection() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Podcast: Aurora Voice erklärt
          </h2>
          <p className="mx-auto max-w-2xl text-foreground-secondary">
            Erfahre in wenigen Minuten, wie Aurora Voice deine Meetings revolutioniert.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <GlassCard padding="lg">
            <div className="flex flex-col items-center gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                <Mic className="h-8 w-8 text-primary" />
              </div>

              <div className="text-center">
                <h3 className="mb-2 text-xl font-semibold">
                  Nie wieder Protokolle dank lokaler KI
                </h3>
                <p className="text-sm text-foreground-secondary">
                  Ein Deep Dive in die Technologie hinter Aurora Voice
                </p>
              </div>

              <audio
                controls
                className="w-full max-w-md"
                preload="metadata"
              >
                <source src="/aurora-voice/podcast.m4a" type="audio/mp4" />
                Dein Browser unterstützt kein Audio.
              </audio>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}
