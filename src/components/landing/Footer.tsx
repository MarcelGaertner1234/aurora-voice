'use client';

import { motion } from 'framer-motion';
import { Github, Download, Mic, Trophy } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative overflow-hidden px-4 py-20">
      {/* Background Gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-primary/5 to-transparent" />

      <div className="mx-auto max-w-6xl">
        {/* Final CTA */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Bereit, deine Meetings zu transformieren?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-foreground-secondary">
            Lade Aurora Voice jetzt herunter und erlebe, wie KI deine Meetings
            produktiver macht.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="https://github.com/MarcelGaertner1234/aurora-voice/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-4 text-lg font-medium text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
            >
              <Download className="h-5 w-5" />
              Download für macOS
            </a>
            <a
              href="https://github.com/MarcelGaertner1234/aurora-voice"
              target="_blank"
              rel="noopener noreferrer"
              className="glass flex items-center gap-2 rounded-full px-8 py-4 text-lg font-medium transition-all hover:scale-105"
            >
              <Github className="h-5 w-5" />
              GitHub
            </a>
          </div>
        </motion.div>

        {/* Everlast Challenge Badge */}
        <motion.div
          className="mb-12 flex justify-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <div className="glass inline-flex items-center gap-3 rounded-full px-6 py-3">
            <Trophy className="h-5 w-5 text-warning" />
            <span className="text-sm">
              Built for <span className="font-semibold">Everlast Challenge</span>
            </span>
          </div>
        </motion.div>

        {/* Footer Links */}
        <div className="flex flex-col items-center justify-between gap-6 border-t border-foreground/10 pt-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
              <Mic className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">Aurora Voice</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-foreground-secondary">
            <a
              href="https://github.com/MarcelGaertner1234/aurora-voice"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <a
              href="https://github.com/MarcelGaertner1234/aurora-voice/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              MIT License
            </a>
          </div>

          <p className="text-sm text-foreground-secondary">
            &copy; {new Date().getFullYear()} Aurora Voice
          </p>
        </div>
      </div>
    </footer>
  );
}
