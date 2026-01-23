'use client';

import { motion } from 'framer-motion';
import { Search, Shield, BarChart3 } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

const features = [
  {
    icon: Search,
    title: 'Cross-Meeting Intelligence',
    description:
      'Semantische Suche über alle deine Meetings. Finde Entscheidungen, Aufgaben und Diskussionen in Sekunden.',
    gradient: 'from-primary to-blue-400',
    bgColor: 'bg-primary/10',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    description:
      '100% DSGVO-konform. Deine Daten bleiben bei dir. Optional komplett lokal mit Ollama.',
    gradient: 'from-success to-emerald-400',
    bgColor: 'bg-success/10',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description:
      'Messbare Ergebnisse: Verfolge gesparrte Zeit, Meeting-Effizienz und Team-Produktivität.',
    gradient: 'from-secondary to-purple-400',
    bgColor: 'bg-secondary/10',
  },
];

export function FeaturesGrid() {
  return (
    <section className="px-4 py-20" id="features">
      <div className="mx-auto max-w-6xl">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Warum Aurora Voice?
          </h2>
          <p className="mx-auto max-w-2xl text-foreground-secondary">
            Drei Killer-Features, die Aurora Voice von anderen Lösungen unterscheiden.
          </p>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
            >
              <GlassCard
                className="group h-full transition-all hover:scale-[1.02]"
                padding="lg"
                whileHover={{ y: -5 }}
              >
                {/* Icon */}
                <div
                  className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${feature.bgColor}`}
                >
                  <feature.icon
                    className={`h-7 w-7 bg-gradient-to-br ${feature.gradient} bg-clip-text`}
                    style={{
                      color: feature.gradient.includes('primary')
                        ? 'var(--aurora-primary)'
                        : feature.gradient.includes('success')
                          ? 'var(--aurora-success)'
                          : 'var(--aurora-secondary)',
                    }}
                  />
                </div>

                {/* Content */}
                <h3 className="mb-3 text-xl font-semibold">{feature.title}</h3>
                <p className="text-foreground-secondary">{feature.description}</p>

                {/* Hover Gradient Line */}
                <div className="mt-6 h-1 w-0 rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 group-hover:w-full" />
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
