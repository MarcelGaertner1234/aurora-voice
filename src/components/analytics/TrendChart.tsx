'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { GlassCard } from '@/components/ui/glass-card';
import type { WeeklyMetrics, DayOfWeekActivity } from '@/lib/analytics/metrics';

interface TrendChartProps {
  data: WeeklyMetrics[];
  title: string;
  metric: 'meetingsCount' | 'timeSavedMinutes' | 'decisionsCount' | 'tasksCount';
  color?: string;
}

export function TrendChart({ data, title, metric, color = 'bg-primary' }: TrendChartProps) {
  const maxValue = useMemo(() => {
    return Math.max(...data.map(d => d[metric]), 1);
  }, [data, metric]);

  const formatValue = (value: number): string => {
    if (metric === 'timeSavedMinutes') {
      if (value >= 60) {
        return `${(value / 60).toFixed(1)}h`;
      }
      return `${Math.round(value)}m`;
    }
    return String(Math.round(value));
  };

  return (
    <GlassCard variant="subtle" padding="md">
      <h3 className="text-sm font-medium text-foreground-secondary mb-4">{title}</h3>
      <div className="flex items-end justify-between gap-2 h-32">
        {data.map((week, index) => {
          const height = (week[metric] / maxValue) * 100;
          const weekLabel = format(week.weekStart, 'dd. MMM', { locale: de });

          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-foreground-secondary">
                {formatValue(week[metric])}
              </span>
              <div className="w-full h-24 bg-foreground/5 rounded-t-lg relative overflow-hidden">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`absolute bottom-0 left-0 right-0 ${color} rounded-t-lg`}
                />
              </div>
              <span className="text-[10px] text-foreground-secondary truncate w-full text-center">
                {weekLabel}
              </span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

interface PieChartProps {
  title: string;
  data: { label: string; value: number; color: string }[];
}

export function PieChart({ title, data }: PieChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const segments = useMemo(() => {
    let currentAngle = 0;
    return data.map(d => {
      const percentage = total > 0 ? (d.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const segment = {
        ...d,
        percentage,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
      };
      currentAngle += angle;
      return segment;
    });
  }, [data, total]);

  // Create SVG arc path
  const createArc = (startAngle: number, endAngle: number, radius: number, cx: number, cy: number) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    return [
      'M', cx, cy,
      'L', start.x, start.y,
      'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (cx: number, cy: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  };

  return (
    <GlassCard variant="subtle" padding="md">
      <h3 className="text-sm font-medium text-foreground-secondary mb-4">{title}</h3>
      <div className="flex items-center gap-6">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {total === 0 ? (
            <circle cx="60" cy="60" r="50" fill="currentColor" className="text-foreground/10" />
          ) : (
            segments.map((segment, index) => (
              <motion.path
                key={index}
                d={createArc(segment.startAngle, segment.endAngle, 50, 60, 60)}
                fill={segment.color}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              />
            ))
          )}
          <circle cx="60" cy="60" r="25" className="fill-background" />
          <text x="60" y="65" textAnchor="middle" className="text-lg font-bold fill-foreground">
            {total}
          </text>
        </svg>
        <div className="flex-1 space-y-2">
          {data.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-foreground-secondary flex-1">{item.label}</span>
              <span className="text-sm font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

interface HeatmapProps {
  title: string;
  data: DayOfWeekActivity[];
}

export function ActivityHeatmap({ title, data }: HeatmapProps) {
  const maxCount = useMemo(() => Math.max(...data.map(d => d.meetingsCount), 1), [data]);

  // Reorder: Monday first (German week starts Monday)
  const reorderedData = useMemo(() => {
    const monday = data.slice(1);
    const sunday = data.slice(0, 1);
    return [...monday, ...sunday];
  }, [data]);

  const getIntensity = (count: number): string => {
    if (count === 0) return 'bg-foreground/5';
    const percentage = count / maxCount;
    if (percentage <= 0.25) return 'bg-primary/20';
    if (percentage <= 0.5) return 'bg-primary/40';
    if (percentage <= 0.75) return 'bg-primary/60';
    return 'bg-primary/80';
  };

  return (
    <GlassCard variant="subtle" padding="md">
      <h3 className="text-sm font-medium text-foreground-secondary mb-4">{title}</h3>
      <div className="flex gap-1">
        {reorderedData.map((day, index) => (
          <div key={index} className="flex-1 flex flex-col items-center gap-1">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`w-full aspect-square rounded-md ${getIntensity(day.meetingsCount)}`}
              title={`${day.dayName}: ${day.meetingsCount} Meetings`}
            />
            <span className="text-[10px] text-foreground-secondary">
              {day.dayName.slice(0, 2)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-foreground-secondary">
        <span>Weniger</span>
        <div className="w-3 h-3 rounded bg-foreground/5" />
        <div className="w-3 h-3 rounded bg-primary/20" />
        <div className="w-3 h-3 rounded bg-primary/40" />
        <div className="w-3 h-3 rounded bg-primary/60" />
        <div className="w-3 h-3 rounded bg-primary/80" />
        <span>Mehr</span>
      </div>
    </GlassCard>
  );
}

interface RecentMeetingsListProps {
  meetings: Array<{
    meetingId: string;
    date: Date;
    durationMinutes: number;
    decisionsCount: number;
    tasksExtracted: number;
    estimatedTimeSavedMinutes: number;
  }>;
  title: string;
}

export function RecentMeetingsList({ meetings, title }: RecentMeetingsListProps) {
  if (meetings.length === 0) {
    return (
      <GlassCard variant="subtle" padding="md">
        <h3 className="text-sm font-medium text-foreground-secondary mb-4">{title}</h3>
        <p className="text-sm text-foreground-secondary text-center py-6">
          Keine Meetings im ausgewählten Zeitraum
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="subtle" padding="md">
      <h3 className="text-sm font-medium text-foreground-secondary mb-4">{title}</h3>
      <div className="space-y-3">
        {meetings.map((meeting, index) => (
          <motion.div
            key={meeting.meetingId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="flex items-center gap-3 p-2 rounded-lg bg-foreground/5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {format(meeting.date, 'dd. MMMM yyyy', { locale: de })}
              </div>
              <div className="text-xs text-foreground-secondary">
                {Math.round(meeting.durationMinutes)} Min · {meeting.decisionsCount} Entscheidungen · {meeting.tasksExtracted} Tasks
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-green-400">
                +{Math.round(meeting.estimatedTimeSavedMinutes)} Min
              </div>
              <div className="text-[10px] text-foreground-secondary">gespart</div>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}
