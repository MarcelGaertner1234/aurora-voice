// Analytics Store for Aurora Voice
// Manages analytics data and calculations

import { create } from 'zustand';
import { getAllMeetings, getAllTasks } from '@/lib/db';
import {
  aggregateMetrics,
  getWeeklyTrends,
  getDayOfWeekActivity,
  getDecisionRatio,
  getQuestionResolutionRatio,
  calculateMeetingMetrics,
  type AggregatedMetrics,
  type WeeklyMetrics,
  type DayOfWeekActivity,
  type MeetingMetrics,
} from '@/lib/analytics/metrics';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';

export type TimeRange = 'week' | 'month' | 'quarter' | 'all';

interface AnalyticsState {
  // Data
  meetings: Meeting[];
  tasks: Task[];
  isLoading: boolean;
  error: string | null;

  // Selected time range
  timeRange: TimeRange;

  // Computed metrics (cached)
  aggregatedMetrics: AggregatedMetrics | null;
  weeklyTrends: WeeklyMetrics[];
  dayOfWeekActivity: DayOfWeekActivity[];
  decisionRatio: { decided: number; pending: number };
  questionRatio: { answered: number; open: number };
  recentMeetingMetrics: MeetingMetrics[];

  // Actions
  loadAnalytics: () => Promise<void>;
  setTimeRange: (range: TimeRange) => void;
  refreshMetrics: () => void;
  clearError: () => void;
}

function filterMeetingsByTimeRange(meetings: Meeting[], range: TimeRange): Meeting[] {
  if (range === 'all') return meetings;

  const now = new Date();
  let cutoffDate: Date;

  switch (range) {
    case 'week':
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      return meetings;
  }

  return meetings.filter(m => m.createdAt >= cutoffDate);
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // Initial state
  meetings: [],
  tasks: [],
  isLoading: false,
  error: null,
  timeRange: 'month',
  aggregatedMetrics: null,
  weeklyTrends: [],
  dayOfWeekActivity: [],
  decisionRatio: { decided: 0, pending: 0 },
  questionRatio: { answered: 0, open: 0 },
  recentMeetingMetrics: [],

  // Load all analytics data
  loadAnalytics: async () => {
    set({ isLoading: true, error: null });

    try {
      const [meetings, tasks] = await Promise.all([
        getAllMeetings(),
        getAllTasks(),
      ]);

      set({ meetings, tasks });

      // Calculate metrics
      get().refreshMetrics();

      set({ isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load analytics',
        isLoading: false,
      });
    }
  },

  // Set time range and recalculate
  setTimeRange: (range: TimeRange) => {
    set({ timeRange: range });
    get().refreshMetrics();
  },

  // Recalculate all metrics based on current data and time range
  refreshMetrics: () => {
    const { meetings, tasks, timeRange } = get();

    const filteredMeetings = filterMeetingsByTimeRange(meetings, timeRange);

    // Calculate aggregated metrics
    const aggregatedMetrics = aggregateMetrics(filteredMeetings, tasks);

    // Calculate weekly trends (always 4 weeks)
    const weeklyTrends = getWeeklyTrends(meetings, tasks, 4);

    // Calculate day of week activity
    const dayOfWeekActivity = getDayOfWeekActivity(filteredMeetings);

    // Calculate decision ratio
    const decisionRatio = getDecisionRatio(filteredMeetings);

    // Calculate question ratio
    const questionRatio = getQuestionResolutionRatio(filteredMeetings);

    // Get recent meeting metrics (last 5)
    const recentMeetingMetrics = filteredMeetings
      .filter(m => m.status === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map(m => calculateMeetingMetrics(m, tasks));

    set({
      aggregatedMetrics,
      weeklyTrends,
      dayOfWeekActivity,
      decisionRatio,
      questionRatio,
      recentMeetingMetrics,
    });
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
