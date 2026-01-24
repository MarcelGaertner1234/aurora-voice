'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ExternalLink, ArrowLeft, ArrowRight, Server, CheckCircle } from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import type { StepProps } from '@/hooks/use-onboarding';

export function ApiKeyStep({ onNext, onBack }: StepProps) {
  const { settings, updateSettings } = useAppStore();
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaBaseUrl);

  const isOllama = settings.selectedProvider === 'ollama';
  const providerName = settings.selectedProvider === 'openai' ? 'OpenAI' : 'Anthropic';
  const keyPlaceholder = settings.selectedProvider === 'openai' ? 'sk-...' : 'sk-ant-...';
  const keyLink = settings.selectedProvider === 'openai'
    ? 'https://platform.openai.com/api-keys'
    : 'https://console.anthropic.com/keys';

  // Get current key from settings
  const currentKey = settings.selectedProvider === 'openai'
    ? settings.openaiApiKey
    : settings.anthropicApiKey;

  const handleSave = () => {
    if (isOllama) {
      updateSettings({ ollamaBaseUrl: ollamaUrl });
    } else {
      if (settings.selectedProvider === 'openai') {
        updateSettings({ openaiApiKey: apiKey || currentKey });
      } else {
        updateSettings({ anthropicApiKey: apiKey || currentKey });
      }
    }
    onNext();
  };

  const hasKey = isOllama ? !!ollamaUrl : !!(apiKey || currentKey);

  // Ollama Setup
  if (isOllama) {
    return (
      <div className="space-y-6">
        {/* Title */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Ollama einrichten</h2>
          <p className="mt-2 text-sm text-foreground-secondary">
            Stelle sicher, dass Ollama auf deinem Rechner läuft.
          </p>
        </div>

        {/* URL Input */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground">
            Ollama Server URL
          </label>
          <input
            type="url"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full rounded-lg bg-background-secondary px-4 py-3 text-sm text-foreground placeholder:text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-foreground-secondary">
            Standard: http://localhost:11434
          </p>
        </div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg bg-background-secondary p-4 space-y-2"
        >
          <h3 className="text-sm font-medium text-foreground">Schnellstart:</h3>
          <ol className="text-xs text-foreground-secondary space-y-1 list-decimal list-inside">
            <li>Installiere Ollama von ollama.com</li>
            <li>Öffne Terminal: <code className="px-1 py-0.5 bg-foreground/10 rounded">ollama serve</code></li>
            <li>Lade ein Modell: <code className="px-1 py-0.5 bg-foreground/10 rounded">ollama pull llama3.2</code></li>
          </ol>
        </motion.div>

        {/* Note about Whisper */}
        <p className="text-xs text-center text-warning">
          Hinweis: Für Live-Transkription wird zusätzlich ein OpenAI API Key benötigt.
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
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-medium transition-all hover:bg-primary/90"
          >
            Weiter
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // OpenAI / Anthropic Setup
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">API Key eingeben</h2>
        <p className="mt-2 text-sm text-foreground-secondary">
          Dein {providerName} API Key wird sicher auf deinem Gerät gespeichert.
        </p>
      </div>

      {/* Key Input */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">
          {providerName} API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey || currentKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyPlaceholder}
            className="w-full rounded-lg bg-background-secondary px-4 py-3 pr-12 text-sm text-foreground placeholder:text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-secondary hover:text-foreground"
          >
            {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {/* Link to create key */}
        <a
          href={keyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Noch keinen Key? Hier erstellen
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Success indicator */}
      {hasKey && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 text-success text-sm"
        >
          <CheckCircle className="w-4 h-4" />
          API Key gespeichert
        </motion.div>
      )}

      {/* Privacy note */}
      <p className="text-xs text-foreground-secondary">
        Dein API Key wird nur lokal gespeichert und niemals an unsere Server übertragen.
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
          onClick={handleSave}
          disabled={!hasKey}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-medium transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Weiter
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
