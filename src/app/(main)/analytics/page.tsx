'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  ListTodo,
  TrendingUp,
  Lightbulb,
  HelpCircle,
  Timer,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { useAnalyticsStore, type TimeRange } from '@/lib/store/analytics-store';
import { formatDuration, formatTimeSaved } from '@/lib/analytics/metrics';
import { GlassCard } from '@/components/ui/glass-card';
import {
  MetricsCard,
  MetricsGrid,
  HighlightCard,
} from '@/components/analytics/MetricsCard';
import {
  TrendChart,
  PieChart,
  ActivityHeatmap,
  RecentMeetingsList,
} from '@/components/analytics/TrendChart';

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: 'week', label: 'Diese Woche' },
  { value: 'month', label: 'Dieser Monat' },
  { value: 'quarter', label: 'Quartal' },
  { value: 'all', label: 'Alle Zeit' },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const {
    isLoading,
    error,
    timeRange,
    aggregatedMetrics,
    weeklyTrends,
    dayOfWeekActivity,
    decisionRatio,
    questionRatio,
    recentMeetingMetrics,
    loadAnalytics,
    setTimeRange,
    clearError,
  } = useAnalyticsStore();

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const metrics = aggregatedMetrics;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="titlebar-drag-region sticky top-0 z-40 flex h-14 items-center justify-between border-b border-foreground/5 bg-background/80 px-4 backdrop-blur-xl">
        <div className="titlebar-no-drag flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-medium text-foreground">Analytics</h1>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="titlebar-no-drag flex items-center gap-2">
          <div className="flex rounded-lg bg-foreground/5 p-0.5">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value)}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  timeRange === option.value
                    ? 'bg-primary text-white'
                    : 'text-foreground-secondary hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-6">
        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-3 rounded-lg bg-error/10 p-4 text-error"
          >
            <span className="flex-1 text-sm">{error}</span>
            <button onClick={clearError} className="text-error/60 hover:text-error">
              ×
            </button>
          </motion.div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-2 text-sm text-foreground-secondary">Lade Analytics...</p>
          </div>
        ) : !metrics ? (
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto text-foreground-secondary mb-4" />
            <h3 className="text-lg font-medium text-foreground">Keine Daten</h3>
            <p className="mt-1 text-sm text-foreground-secondary">
              Starten Sie ein Meeting, um Analytics zu sehen.
            </p>
          </div>
        ) : (
          <>
            {/* Hero: Time Saved */}
            <div className="mb-6">
              <HighlightCard
                title="Zeitersparnis durch Aurora"
                value={formatTimeSaved(metrics.totalTimeSavedMinutes)}
                description={`Bei ${metrics.totalMeetings} Meetings wurde die manuelle Arbeit durch KI ersetzt`}
                icon={Timer}
                gradient="success"
              />
            </div>

            {/* Key Metrics */}
            <MetricsGrid columns={4}>
              <MetricsCard
                title="Meetings"
                value={metrics.totalMeetings}
                subtitle={`Ø ${Math.round(metrics.avgMeetingDuration)} Min`}
                icon={Calendar}
                iconColor="text-blue-400"
              />
              <MetricsCard
                title="Entscheidungen"
                value={metrics.totalDecisions}
                subtitle={`Ø ${metrics.avgDecisionsPerMeeting.toFixed(1)} pro Meeting`}
                icon={CheckCircle2}
                iconColor="text-green-400"
              />
              <MetricsCard
                title="Aufgaben"
                value={metrics.totalTasks}
                subtitle={`Ø ${metrics.avgTasksPerMeeting.toFixed(1)} pro Meeting`}
                icon={ListTodo}
                iconColor="text-amber-400"
              />
              <MetricsCard
                title="Key Points"
                value={metrics.totalKeyPoints}
                subtitle="Wichtige Erkenntnisse"
                icon={Lightbulb}
                iconColor="text-purple-400"
              />
            </MetricsGrid>

            {/* Secondary Metrics */}
            <div className="mt-4">
              <MetricsGrid columns={3}>
                <MetricsCard
                  title="Meeting-Zeit"
                  value={formatDuration(metrics.totalDurationMinutes)}
                  subtitle="Gesamte aufgezeichnete Zeit"
                  icon={Clock}
                  iconColor="text-cyan-400"
                  size="sm"
                />
                <MetricsCard
                  title="Offene Fragen"
                  value={metrics.totalQuestions}
                  subtitle="Aus Meetings extrahiert"
                  icon={HelpCircle}
                  iconColor="text-orange-400"
                  size="sm"
                />
                <MetricsCard
                  title="Decision Velocity"
                  value={`${metrics.avgDecisionVelocity.toFixed(1)}/h`}
                  subtitle="Entscheidungen pro Stunde"
                  icon={TrendingUp}
                  iconColor="text-emerald-400"
                  size="sm"
                />
              </MetricsGrid>
            </div>

            {/* Charts Section */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Trend Charts */}
              <TrendChart
                title="Meetings pro Woche"
                data={weeklyTrends}
                metric="meetingsCount"
                color="bg-blue-500"
              />
              <TrendChart
                title="Zeitersparnis pro Woche"
                data={weeklyTrends}
                metric="timeSavedMinutes"
                color="bg-green-500"
              />

              {/* Pie Charts */}
              <PieChart
                title="Entscheidungen"
                data={[
                  { label: 'Getroffen', value: decisionRatio.decided, color: '#22c55e' },
                  { label: 'Ausstehend', value: decisionRatio.pending, color: '#f59e0b' },
                ]}
              />
              <PieChart
                title="Fragen"
                data={[
                  { label: 'Beantwortet', value: questionRatio.answered, color: '#3b82f6' },
                  { label: 'Offen', value: questionRatio.open, color: '#ef4444' },
                ]}
              />

              {/* Activity Heatmap */}
              <ActivityHeatmap
                title="Meeting-Aktivität nach Wochentag"
                data={dayOfWeekActivity}
              />

              {/* Tasks Trend */}
              <TrendChart
                title="Extrahierte Tasks pro Woche"
                data={weeklyTrends}
                metric="tasksCount"
                color="bg-amber-500"
              />
            </div>

            {/* Recent Meetings */}
            <div className="mt-8">
              <RecentMeetingsList
                title="Letzte Meetings"
                meetings={recentMeetingMetrics}
              />
            </div>

            {/* ROI Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8"
            >
              <GlassCard className="text-center py-8">
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Aurora ROI Zusammenfassung
                </h3>
                <p className="text-foreground-secondary text-sm max-w-2xl mx-auto">
                  Mit Aurora Voice haben Sie in{' '}
                  <span className="text-foreground font-medium">{metrics.totalMeetings} Meetings</span>{' '}
                  insgesamt{' '}
                  <span className="text-green-400 font-bold">{formatTimeSaved(metrics.totalTimeSavedMinutes)}</span>{' '}
                  an manueller Dokumentationsarbeit gespart.
                  Es wurden{' '}
                  <span className="text-foreground font-medium">{metrics.totalDecisions} Entscheidungen</span>{' '}
                  und{' '}
                  <span className="text-foreground font-medium">{metrics.totalTasks} Aufgaben</span>{' '}
                  automatisch extrahiert.
                </p>
              </GlassCard>
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
