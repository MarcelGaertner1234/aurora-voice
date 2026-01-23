'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Shield,
  Server,
  Cloud,
  Lock,
  Eye,
  Database,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import { getPrivacyStatus, getProcessingLog, type ProcessingLogEntry } from '@/lib/privacy/data-export';
import { GlassCard } from '@/components/ui/glass-card';
import { PrivacyInfoBanner } from '@/components/privacy/PrivacyBadge';
import { DataExportPanel, DataDeletionPanel } from '@/components/privacy/DataExport';
import { OllamaWizard } from '@/components/privacy/OllamaWizard';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const { settings } = useAppStore();
  const [processingLog, setProcessingLog] = useState<ProcessingLogEntry[]>([]);

  const status = getPrivacyStatus(settings.selectedProvider);
  const isLocal = status.provider === 'local';

  useEffect(() => {
    setProcessingLog(getProcessingLog());
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="titlebar-drag-region sticky top-0 z-40 flex h-14 items-center justify-between border-b border-foreground/5 bg-background/80 px-4 backdrop-blur-xl">
        <div className="titlebar-no-drag flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-medium text-foreground">Datenschutz & Privacy</h1>
          </div>
        </div>

        {/* Status Badge */}
        <div className="titlebar-no-drag">
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isLocal
              ? 'bg-green-500/20 text-green-400'
              : 'bg-amber-500/20 text-amber-400'
          }`}>
            {isLocal ? <Lock className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
            {isLocal ? 'Vollständig lokal' : 'Cloud-Verarbeitung'}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Current Status */}
        <GlassCard padding="lg">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
              isLocal ? 'bg-green-500/20' : 'bg-amber-500/20'
            }`}>
              {isLocal ? (
                <Server className="h-7 w-7 text-green-400" />
              ) : (
                <Cloud className="h-7 w-7 text-amber-400" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-medium text-foreground">{status.providerName}</h2>
              <p className="text-sm text-foreground-secondary">{status.description}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-foreground/5">
              <Database className="h-5 w-5 text-foreground-secondary" />
              <div className="flex-1">
                <div className="text-sm text-foreground">Datenspeicherung</div>
                <div className="text-xs text-foreground-secondary">
                  Alle Meetings und Aufgaben werden lokal in IndexedDB gespeichert.
                </div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-foreground/5">
              <Eye className="h-5 w-5 text-foreground-secondary" />
              <div className="flex-1">
                <div className="text-sm text-foreground">KI-Verarbeitung</div>
                <div className="text-xs text-foreground-secondary">
                  {status.dataLocation}
                </div>
              </div>
              {isLocal ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-400" />
              )}
            </div>
          </div>
        </GlassCard>

        {/* Privacy Info Banner */}
        <PrivacyInfoBanner provider={settings.selectedProvider} />

        {/* Local AI Setup */}
        {!isLocal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <OllamaWizard />
          </motion.div>
        )}

        {/* Data Processing Overview */}
        <GlassCard variant="subtle" padding="lg">
          <h3 className="text-lg font-medium text-foreground mb-4">Datenverarbeitung</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Transcription */}
              <div className="p-4 rounded-lg bg-foreground/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">Transkription</span>
                </div>
                <p className="text-xs text-foreground-secondary mb-2">
                  Umwandlung von Sprache in Text
                </p>
                <div className="flex items-center gap-2 text-xs">
                  {settings.selectedProvider === 'ollama' ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-400" />
                      <span className="text-green-400">Lokal (Whisper)</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-400">OpenAI Whisper API</span>
                    </>
                  )}
                </div>
              </div>

              {/* Enrichment */}
              <div className="p-4 rounded-lg bg-foreground/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">KI-Anreicherung</span>
                </div>
                <p className="text-xs text-foreground-secondary mb-2">
                  Zusammenfassung, Tasks, Entscheidungen
                </p>
                <div className="flex items-center gap-2 text-xs">
                  {settings.selectedProvider === 'ollama' ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-400" />
                      <span className="text-green-400">Lokal ({settings.selectedModel})</span>
                    </>
                  ) : settings.selectedProvider === 'openai' ? (
                    <>
                      <Cloud className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-400">OpenAI ({settings.selectedModel})</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-400">Anthropic ({settings.selectedModel})</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Processing Log */}
            {processingLog.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-foreground-secondary mb-2">
                  Letzte Verarbeitungen
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {processingLog.slice(0, 10).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 p-2 rounded bg-foreground/5 text-xs"
                    >
                      <span className="text-foreground-secondary">
                        {entry.timestamp.toLocaleTimeString('de-DE')}
                      </span>
                      <span className="text-foreground">{entry.action}</span>
                      <span className="text-foreground-secondary">via {entry.provider}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* GDPR Rights Section */}
        <GlassCard variant="subtle" padding="lg">
          <h3 className="text-lg font-medium text-foreground mb-4">Ihre DSGVO-Rechte</h3>

          <div className="space-y-3 text-sm text-foreground-secondary">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
              <div>
                <strong className="text-foreground">Art. 15 - Auskunftsrecht:</strong>{' '}
                Sie können alle gespeicherten Daten unten einsehen und exportieren.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
              <div>
                <strong className="text-foreground">Art. 17 - Recht auf Löschung:</strong>{' '}
                Sie können alle Ihre Daten jederzeit vollständig löschen.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
              <div>
                <strong className="text-foreground">Art. 20 - Datenübertragbarkeit:</strong>{' '}
                Exportieren Sie Ihre Daten in einem maschinenlesbaren Format (JSON).
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Data Export */}
        <DataExportPanel />

        {/* Data Deletion */}
        <DataDeletionPanel />

        {/* More Info */}
        <GlassCard variant="subtle" padding="md">
          <a
            href="https://gdpr.eu/what-is-gdpr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between text-foreground-secondary hover:text-foreground transition-colors"
          >
            <span className="text-sm">Mehr über DSGVO erfahren</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </GlassCard>
      </main>
    </div>
  );
}
