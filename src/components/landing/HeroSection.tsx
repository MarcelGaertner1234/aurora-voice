'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mic, Play, Monitor, Keyboard, Shield, ArrowRight } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-20">
      {/* Animated Background Gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
        <motion.div
          className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 blur-3xl"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Logo & Brand */}
      <motion.div
        className="mb-8 flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary">
          <Mic className="h-6 w-6 text-white" />
        </div>
        <span className="text-2xl font-semibold">Aurora Voice</span>
      </motion.div>

      {/* Main Headline */}
      <motion.h1
        className="mb-6 text-center text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
          Sprich.
        </span>
        <br />
        <span className="text-foreground">Aurora hört zu.</span>
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        className="mb-10 max-w-2xl text-center text-lg text-foreground-secondary sm:text-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Dein KI-Meeting-Assistent mit Voice Intelligence.
        <br className="hidden sm:block" />
        Von Sprache zu strukturierten Ergebnissen in Sekunden.
      </motion.p>

      {/* CTA Buttons */}
      <motion.div
        className="mb-12 flex flex-col gap-4 sm:flex-row"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <Link
          href="/app"
          className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-4 text-lg font-medium text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        >
          <ArrowRight className="h-5 w-5" />
          App starten
        </Link>
        <a
          href="#how-it-works"
          className="glass flex items-center justify-center gap-2 rounded-full px-8 py-4 text-lg font-medium transition-all hover:scale-105"
        >
          <Play className="h-5 w-5" />
          Demo ansehen
        </a>
      </motion.div>

      {/* Trust Badges */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        <div className="flex items-center gap-2 text-sm text-foreground-secondary">
          <Monitor className="h-4 w-4 text-primary" />
          <span>Desktop App</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary">
          <Keyboard className="h-4 w-4 text-primary" />
          <span>Hotkey-Aktivierung</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary">
          <Shield className="h-4 w-4 text-success" />
          <span>DSGVO-konform</span>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 10, 0] }}
        transition={{
          opacity: { delay: 1, duration: 0.5 },
          y: { delay: 1, duration: 2, repeat: Infinity },
        }}
      >
        <div className="flex flex-col items-center gap-2 text-foreground-secondary">
          <span className="text-xs">Mehr erfahren</span>
          <div className="h-6 w-4 rounded-full border-2 border-foreground-secondary/50 p-1">
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-foreground-secondary"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
