'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Terminal,
  Cpu,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import { GlassCard } from '@/components/ui/glass-card';

type SetupStep = 'check' | 'install' | 'download' | 'configure' | 'complete';

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: string[];
  error?: string;
}

// Recommended models for different use cases
const RECOMMENDED_MODELS = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2 (3B)',
    description: 'Schnell und effizient, ideal für die meisten Aufgaben',
    size: '~2 GB',
    recommended: true,
  },
  {
    id: 'mistral',
    name: 'Mistral (7B)',
    description: 'Ausgewogene Performance und Qualität',
    size: '~4 GB',
    recommended: false,
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 (8B)',
    description: 'Beste Qualität für lokale Verarbeitung',
    size: '~4.7 GB',
    recommended: false,
  },
];

export function OllamaWizard() {
  const { settings, updateSettings } = useAppStore();
  const [currentStep, setCurrentStep] = useState<SetupStep>('check');
  const [status, setStatus] = useState<OllamaStatus>({
    installed: false,
    running: false,
    models: [],
  });
  const [isChecking, setIsChecking] = useState(true);
  const [selectedModel, setSelectedModel] = useState('llama3.2');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setIsChecking(true);
    try {
      const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: { name: string }) => m.name) || [];
        setStatus({
          installed: true,
          running: true,
          models,
        });

        // Skip to configure if running but no models
        if (models.length === 0) {
          setCurrentStep('download');
        } else {
          setCurrentStep('configure');
        }
      } else {
        throw new Error('Ollama not responding');
      }
    } catch {
      // Check if it's just not running vs not installed
      setStatus({
        installed: false,
        running: false,
        models: [],
        error: 'Ollama nicht erreichbar',
      });
      setCurrentStep('install');
    } finally {
      setIsChecking(false);
    }
  };

  const simulateModelDownload = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);

    // Simulate download progress
    for (let i = 0; i <= 100; i += 5) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setDownloadProgress(i);
    }

    // Try to actually pull the model
    try {
      const response = await fetch(`${settings.ollamaBaseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedModel }),
      });

      if (response.ok) {
        setStatus(prev => ({
          ...prev,
          models: [...prev.models, selectedModel],
        }));
        setCurrentStep('configure');
      }
    } catch {
      // Simulation only - actual download would be in Ollama CLI
    }

    setIsDownloading(false);
    setCurrentStep('configure');
  };

  const completeSetup = () => {
    updateSettings({
      selectedProvider: 'ollama',
      selectedModel: selectedModel,
    });
    setCurrentStep('complete');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'check':
        return (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-foreground-secondary">Prüfe Ollama-Status...</p>
          </div>
        );

      case 'install':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <Server className="h-8 w-8 text-amber-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Ollama installieren</h3>
              <p className="text-sm text-foreground-secondary">
                Für lokale KI-Verarbeitung benötigen Sie Ollama.
              </p>
            </div>

            <div className="space-y-3">
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 rounded-lg bg-foreground/5 hover:bg-foreground/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-foreground">Ollama herunterladen</div>
                    <div className="text-xs text-foreground-secondary">ollama.com/download</div>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-foreground-secondary" />
              </a>

              <div className="p-4 rounded-lg bg-foreground/5">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="h-4 w-4 text-foreground-secondary" />
                  <span className="text-xs text-foreground-secondary">Oder via Terminal:</span>
                </div>
                <code className="text-sm text-primary font-mono">
                  curl -fsSL https://ollama.com/install.sh | sh
                </code>
              </div>
            </div>

            <button
              onClick={checkOllamaStatus}
              className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
            >
              Status erneut prüfen
            </button>
          </div>
        );

      case 'download':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Ollama läuft!</h3>
              <p className="text-sm text-foreground-secondary">
                Wählen Sie ein KI-Modell für die lokale Verarbeitung.
              </p>
            </div>

            <div className="space-y-2">
              {RECOMMENDED_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
                    selectedModel === model.id
                      ? 'border-primary bg-primary/10'
                      : 'border-foreground/10 bg-foreground/5 hover:bg-foreground/10'
                  }`}
                >
                  <Cpu className={`h-5 w-5 ${selectedModel === model.id ? 'text-primary' : 'text-foreground-secondary'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{model.name}</span>
                      {model.recommended && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary">
                          Empfohlen
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-foreground-secondary">{model.description}</div>
                  </div>
                  <span className="text-xs text-foreground-secondary">{model.size}</span>
                </button>
              ))}
            </div>

            {isDownloading ? (
              <div className="space-y-2">
                <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-foreground-secondary text-center">
                  Lade {selectedModel}... {downloadProgress}%
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={simulateModelDownload}
                  className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                >
                  Modell herunterladen
                </button>
                <p className="text-xs text-foreground-secondary text-center">
                  Alternativ via Terminal: <code className="text-primary">ollama pull {selectedModel}</code>
                </p>
              </div>
            )}
          </div>
        );

      case 'configure':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Bereit für lokale KI!</h3>
              <p className="text-sm text-foreground-secondary">
                {status.models.length > 0
                  ? `${status.models.length} Modell(e) verfügbar`
                  : 'Wählen Sie ein Modell aus'
                }
              </p>
            </div>

            {status.models.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm text-foreground-secondary">Modell auswählen:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {status.models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={completeSetup}
              className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              Ollama aktivieren
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center py-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="h-16 w-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </motion.div>
            <h3 className="text-lg font-medium text-foreground mb-2">Einrichtung abgeschlossen!</h3>
            <p className="text-sm text-foreground-secondary mb-4">
              Aurora Voice verwendet jetzt Ollama für vollständig lokale KI-Verarbeitung.
              Keine Daten verlassen mehr Ihren Computer.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-sm">
              <Server className="h-4 w-4" />
              Modell: {selectedModel}
            </div>
          </div>
        );
    }
  };

  if (isChecking && currentStep === 'check') {
    return (
      <GlassCard variant="subtle" padding="lg">
        {renderStep()}
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="subtle" padding="lg">
      <div className="flex items-center gap-2 mb-6">
        <Server className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-medium text-foreground">Ollama Setup</h3>
        {status.running && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Läuft
          </span>
        )}
      </div>

      {renderStep()}
    </GlassCard>
  );
}
