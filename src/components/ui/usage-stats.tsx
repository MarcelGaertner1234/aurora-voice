'use client';

import { RotateCcw } from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';

// Format number with locale
function formatNumber(num: number): string {
  return num.toLocaleString('de-DE');
}

// Calculate total cost across all providers
function calculateTotalCost(usageStats: {
  byProvider: {
    openai: { cost: number };
    anthropic: { cost: number };
    ollama: { cost: number };
  };
}): number {
  return (
    usageStats.byProvider.openai.cost +
    usageStats.byProvider.anthropic.cost +
    usageStats.byProvider.ollama.cost
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] bg-background-secondary p-3">
      <div className="text-xs text-foreground-secondary">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export function UsageStats() {
  const { usageStats, resetUsageStats } = useAppStore();

  const totalCost = calculateTotalCost(usageStats);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Transkribiert"
          value={`${usageStats.totalTranscriptionMinutes.toFixed(1)} min`}
        />
        <StatCard
          label="Aufnahmen"
          value={usageStats.totalRecordings}
        />
        <StatCard
          label="Geschätzte Kosten"
          value={`~$${totalCost.toFixed(2)}`}
        />
        <StatCard
          label="Tokens (Enrichment)"
          value={formatNumber(usageStats.totalEnrichmentTokens)}
        />
      </div>

      {/* Provider Breakdown */}
      {(usageStats.byProvider.openai.cost > 0 ||
        usageStats.byProvider.anthropic.cost > 0) && (
        <div className="space-y-2 text-xs text-foreground-secondary">
          <div className="font-medium">Kosten nach Provider:</div>
          {usageStats.byProvider.openai.cost > 0 && (
            <div className="flex justify-between">
              <span>OpenAI (Whisper + GPT)</span>
              <span>${usageStats.byProvider.openai.cost.toFixed(3)}</span>
            </div>
          )}
          {usageStats.byProvider.anthropic.cost > 0 && (
            <div className="flex justify-between">
              <span>Anthropic (Claude)</span>
              <span>${usageStats.byProvider.anthropic.cost.toFixed(3)}</span>
            </div>
          )}
          {usageStats.byProvider.ollama.tokens > 0 && (
            <div className="flex justify-between">
              <span>Ollama (Local)</span>
              <span>{formatNumber(usageStats.byProvider.ollama.tokens)} tokens</span>
            </div>
          )}
        </div>
      )}

      {/* Reset Date */}
      {usageStats.lastResetAt && (
        <div className="text-xs text-foreground-secondary">
          Zurückgesetzt am: {new Date(usageStats.lastResetAt).toLocaleDateString('de-DE')}
        </div>
      )}

      {/* Reset Button */}
      <button
        type="button"
        onClick={resetUsageStats}
        className="flex items-center gap-2 rounded-[var(--radius-md)] bg-background-secondary px-4 py-2 text-sm text-foreground-secondary transition-colors hover:text-foreground hover:bg-foreground/5"
      >
        <RotateCcw className="h-4 w-4" />
        Stats zurücksetzen
      </button>
    </div>
  );
}
