'use client';

import { motion } from 'framer-motion';
import { Mic, FileText, Bot, CheckSquare } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

const steps = [
  {
    icon: Mic,
    title: 'Aufnahme',
    description: 'Starte mit einem Hotkey oder Klick',
    tech: 'Hotkey: ⌘+⇧+Space',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    icon: FileText,
    title: 'Transkription',
    description: 'Automatische Sprache-zu-Text Konvertierung',
    tech: 'Whisper API',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  {
    icon: Bot,
    title: 'KI-Enrichment',
    description: 'Intelligente Analyse und Strukturierung',
    tech: 'GPT-4 / Claude',
    color: 'text-secondary',
    bgColor: 'bg-secondary/10',
  },
  {
    icon: CheckSquare,
    title: 'Ergebnis',
    description: 'Tasks, Summary, Entscheidungen',
    tech: 'Strukturierte Daten',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 py-20" id="how-it-works">
      <div className="mx-auto max-w-6xl">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">So funktioniert&apos;s</h2>
          <p className="mx-auto max-w-2xl text-foreground-secondary">
            Von der Aufnahme zum strukturierten Ergebnis in vier einfachen Schritten.
          </p>
        </motion.div>

        {/* Pipeline */}
        <div className="relative">
          {/* Connection Line - Desktop */}
          <div className="absolute left-0 right-0 top-1/2 hidden h-0.5 -translate-y-1/2 bg-gradient-to-r from-primary via-secondary to-success lg:block" />

          {/* Steps Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative"
              >
                <GlassCard className="h-full text-center" padding="lg">
                  {/* Step Number */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                      {index + 1}
                    </span>
                  </div>

                  {/* Icon */}
                  <div
                    className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${step.bgColor}`}
                  >
                    <step.icon className={`h-8 w-8 ${step.color}`} />
                  </div>

                  {/* Content */}
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="mb-3 text-sm text-foreground-secondary">
                    {step.description}
                  </p>

                  {/* Tech Badge */}
                  <span className="inline-block rounded-full bg-background-secondary px-3 py-1 text-xs font-mono text-foreground-secondary">
                    {step.tech}
                  </span>
                </GlassCard>

                {/* Arrow - Mobile/Tablet */}
                {index < steps.length - 1 && (
                  <div className="mt-4 flex justify-center lg:hidden">
                    <span className="text-2xl text-foreground-secondary">↓</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
