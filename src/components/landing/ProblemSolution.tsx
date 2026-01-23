'use client';

import { motion } from 'framer-motion';
import { Clock, FileX, BrainCircuit, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

const problems = [
  {
    icon: Clock,
    title: 'Zeitfresser Meetings',
    description: 'Stundenlange Besprechungen ohne klare Ergebnisse',
  },
  {
    icon: FileX,
    title: 'Manuelle Notizen',
    description: 'Wichtige Details gehen beim Mitschreiben verloren',
  },
  {
    icon: BrainCircuit,
    title: 'Verlorene Entscheidungen',
    description: 'Beschlüsse werden vergessen oder falsch erinnert',
  },
];

export function ProblemSolution() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Problem Section */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Das Problem mit Meetings
          </h2>
          <p className="mx-auto max-w-2xl text-foreground-secondary">
            Meetings sind essentiell, aber oft ineffizient. Wertvolle Informationen
            gehen verloren, Aufgaben werden vergessen, Zeit wird verschwendet.
          </p>
        </motion.div>

        {/* Problem Cards */}
        <div className="mb-20 grid gap-6 sm:grid-cols-3">
          {problems.map((problem, index) => (
            <motion.div
              key={problem.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <GlassCard className="h-full text-center" padding="lg">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
                  <problem.icon className="h-6 w-6 text-error" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{problem.title}</h3>
                <p className="text-sm text-foreground-secondary">
                  {problem.description}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* Solution Section */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-2 text-success">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Die Lösung</span>
          </div>
          <h2 className="mb-6 text-3xl font-bold sm:text-4xl">
            Aurora Voice transformiert deine Meetings
          </h2>
          <p className="mx-auto mb-8 max-w-3xl text-lg text-foreground-secondary">
            Von Sprache zu Transkription zu KI-Enrichment zu strukturierten Ergebnissen.
            Aurora Voice nimmt auf, transkribiert, analysiert und extrahiert automatisch
            Aufgaben, Entscheidungen und Key Points.
          </p>

          {/* Solution Flow */}
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 text-sm sm:gap-4 sm:text-base">
            <span className="rounded-full bg-primary/10 px-4 py-2 text-primary">
              Voice
            </span>
            <span className="text-foreground-secondary">→</span>
            <span className="rounded-full bg-primary/10 px-4 py-2 text-primary">
              Transkription
            </span>
            <span className="text-foreground-secondary">→</span>
            <span className="rounded-full bg-secondary/10 px-4 py-2 text-secondary">
              KI-Enrichment
            </span>
            <span className="text-foreground-secondary">→</span>
            <span className="rounded-full bg-success/10 px-4 py-2 text-success">
              Strukturierte Ergebnisse
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
