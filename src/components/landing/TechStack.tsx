'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';

const technologies = [
  {
    name: 'Next.js',
    description: 'React Framework',
    category: 'Frontend',
  },
  {
    name: 'Tauri',
    description: 'Desktop Runtime',
    category: 'Desktop',
  },
  {
    name: 'OpenAI Whisper',
    description: 'Speech-to-Text',
    category: 'AI',
  },
  {
    name: 'GPT-4 / Claude',
    description: 'LLM Enrichment',
    category: 'AI',
  },
  {
    name: 'Ollama',
    description: '100% Lokal',
    category: 'Privacy',
  },
  {
    name: 'IndexedDB',
    description: 'Lokaler Speicher',
    category: 'Storage',
  },
];

const categoryColors: Record<string, string> = {
  Frontend: 'bg-primary/10 text-primary',
  Desktop: 'bg-secondary/10 text-secondary',
  AI: 'bg-warning/10 text-warning',
  Privacy: 'bg-success/10 text-success',
  Storage: 'bg-blue-400/10 text-blue-400',
};

export function TechStack() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Moderne Technologie
          </h2>
          <p className="mx-auto max-w-2xl text-foreground-secondary">
            Gebaut mit den besten Tools für Performance, Privacy und Developer Experience.
          </p>
        </motion.div>

        <GlassCard padding="lg">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {technologies.map((tech, index) => (
              <motion.div
                key={tech.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-4 rounded-xl bg-background-secondary/50 p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{tech.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${categoryColors[tech.category]}`}
                    >
                      {tech.category}
                    </span>
                  </div>
                  <p className="text-sm text-foreground-secondary">
                    {tech.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
