'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Trash2,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  Database,
  Mic,
  Users,
  ListTodo,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  exportAllData,
  downloadExportedData,
  deleteAllData,
  getDataStatistics,
} from '@/lib/privacy/data-export';
import { GlassCard } from '@/components/ui/glass-card';

interface DataStats {
  meetings: number;
  tasks: number;
  speakers: number;
  recordings: number;
  totalTranscriptWords: number;
  oldestDate: Date | null;
}

export function DataExportPanel() {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const data = await getDataStatistics();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportAllData();
      downloadExportedData(data);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <GlassCard variant="subtle" padding="lg">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-foreground-secondary" />
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="subtle" padding="lg">
      <div className="flex items-center gap-2 mb-4">
        <Database className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-medium text-foreground">Ihre Daten</h3>
      </div>

      <p className="text-sm text-foreground-secondary mb-6">
        Übersicht über alle in Aurora Voice gespeicherten Daten.
        Gemäß DSGVO Art. 20 können Sie alle Ihre Daten exportieren.
      </p>

      {/* Data Statistics */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-lg bg-foreground/5 text-center">
            <Mic className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <div className="text-xl font-bold text-foreground">{stats.meetings}</div>
            <div className="text-xs text-foreground-secondary">Meetings</div>
          </div>
          <div className="p-3 rounded-lg bg-foreground/5 text-center">
            <ListTodo className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <div className="text-xl font-bold text-foreground">{stats.tasks}</div>
            <div className="text-xs text-foreground-secondary">Aufgaben</div>
          </div>
          <div className="p-3 rounded-lg bg-foreground/5 text-center">
            <Users className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <div className="text-xl font-bold text-foreground">{stats.speakers}</div>
            <div className="text-xs text-foreground-secondary">Sprecher</div>
          </div>
          <div className="p-3 rounded-lg bg-foreground/5 text-center">
            <FileText className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <div className="text-xl font-bold text-foreground">
              {stats.totalTranscriptWords.toLocaleString()}
            </div>
            <div className="text-xs text-foreground-secondary">Wörter transkribiert</div>
          </div>
        </div>
      )}

      {stats?.oldestDate && (
        <p className="text-xs text-foreground-secondary mb-6">
          Ältester Datensatz: {stats.oldestDate.toLocaleDateString('de-DE')}
        </p>
      )}

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={isExporting || exportSuccess}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Exportiere...
          </>
        ) : exportSuccess ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Export erfolgreich!
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Alle Daten exportieren (JSON)
          </>
        )}
      </button>

      <p className="text-xs text-foreground-secondary mt-3 text-center">
        Die Datei enthält alle Meetings, Aufgaben, Sprecher und Einstellungen im JSON-Format.
      </p>
    </GlassCard>
  );
}

export function DataDeletionPanel() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== 'LÖSCHEN') return;

    setIsDeleting(true);
    try {
      await deleteAllData();
      setDeleteSuccess(true);
      // Reload after brief delay to reset state
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('Deletion failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <GlassCard variant="subtle" padding="lg" className="border border-red-500/20">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="h-5 w-5 text-red-400" />
        <h3 className="text-lg font-medium text-foreground">Daten löschen</h3>
      </div>

      <p className="text-sm text-foreground-secondary mb-4">
        Gemäß DSGVO Art. 17 (Recht auf Löschung) können Sie alle Ihre Daten unwiderruflich löschen.
      </p>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
        <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-400">
          <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden.
          Alle Meetings, Aufgaben, Sprecher und Einstellungen werden permanent gelöscht.
        </div>
      </div>

      <AnimatePresence>
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-3 rounded-lg border border-red-500/50 text-red-400 font-medium hover:bg-red-500/10 transition-colors"
          >
            Alle Daten löschen...
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <p className="text-sm text-foreground-secondary">
              Geben Sie <strong className="text-foreground">LÖSCHEN</strong> ein, um die Löschung zu bestätigen:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="LÖSCHEN"
              className="w-full px-4 py-2 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText('');
                }}
                className="flex-1 py-2 rounded-lg bg-foreground/10 text-foreground-secondary font-medium hover:bg-foreground/20 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== 'LÖSCHEN' || isDeleting || deleteSuccess}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lösche...
                  </span>
                ) : deleteSuccess ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Gelöscht
                  </span>
                ) : (
                  'Endgültig löschen'
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
