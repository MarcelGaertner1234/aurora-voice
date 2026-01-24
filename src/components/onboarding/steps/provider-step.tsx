'use client';

import { motion } from 'framer-motion';
import { Cloud, Bot, Server, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import type { StepProps } from '@/hooks/use-onboarding';
import type { LLMProvider } from '@/types';

const providers: { id: LLMProvider; name: string; icon: React.ReactNode; desc: string; features: string[] }[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: <Cloud className="w-6 h-6" />,
    desc: 'GPT-4o, Whisper',
    features: ['Beste Qualität', 'Live-Transkription', 'Cloud-basiert'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: <Bot className="w-6 h-6" />,
    desc: 'Claude 4',
    features: ['Lange Kontexte', 'Sicherer', 'Benötigt Whisper'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    icon: <Server className="w-6 h-6" />,
    desc: 'Lokal, kostenlos',
    features: ['100% Privat', 'Keine Kosten', 'Eigene Hardware'],
  },
];

export function ProviderStep({ onNext, onBack }: StepProps) {
  const { settings, updateSettings } = useAppStore();

  const handleSelect = (providerId: LLMProvider) => {
    updateSettings({ selectedProvider: providerId });
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">
          Wähle deinen KI-Provider
        </h2>
        <p className="mt-2 text-sm text-foreground-secondary">
          Alle Provider funktionieren mit Aurora. Du kannst dies später ändern.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="space-y-3">
        {providers.map((provider, index) => (
          <motion.button
            key={provider.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => handleSelect(provider.id)}
            className={`w-full p-4 rounded-xl border-2 text-left flex items-start gap-4 transition-all ${
              settings.selectedProvider === provider.id
                ? 'border-primary bg-primary/10'
                : 'border-foreground/10 hover:border-foreground/20 hover:bg-foreground/5'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              settings.selectedProvider === provider.id
                ? 'bg-primary text-white'
                : 'bg-background-secondary text-foreground-secondary'
            }`}>
              {provider.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{provider.name}</span>
                {settings.selectedProvider === provider.id && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </div>
              <p className="text-sm text-foreground-secondary">{provider.desc}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {provider.features.map((feature) => (
                  <span
                    key={feature}
                    className="px-2 py-0.5 text-xs rounded-full bg-foreground/5 text-foreground-secondary"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Info */}
      <p className="text-xs text-center text-foreground-secondary">
        {settings.selectedProvider === 'openai' && 'OpenAI bietet die beste Kombination aus Transkription und Enrichment.'}
        {settings.selectedProvider === 'anthropic' && 'Claude benötigt weiterhin OpenAI Whisper für die Transkription.'}
        {settings.selectedProvider === 'ollama' && 'Stelle sicher, dass Ollama auf deinem Rechner läuft (Port 11434).'}
      </p>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-foreground-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-medium transition-all hover:bg-primary/90"
        >
          Weiter
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
