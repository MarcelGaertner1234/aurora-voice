'use client';

import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  size?: 'sm' | 'md' | 'lg';
}

export function MetricsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-primary',
  trend,
  size = 'md',
}: MetricsCardProps) {
  const sizeStyles = {
    sm: {
      padding: 'p-3',
      iconSize: 'h-8 w-8',
      iconInner: 'h-4 w-4',
      valueSize: 'text-xl',
      titleSize: 'text-xs',
    },
    md: {
      padding: 'p-4',
      iconSize: 'h-10 w-10',
      iconInner: 'h-5 w-5',
      valueSize: 'text-2xl',
      titleSize: 'text-xs',
    },
    lg: {
      padding: 'p-5',
      iconSize: 'h-12 w-12',
      iconInner: 'h-6 w-6',
      valueSize: 'text-3xl',
      titleSize: 'text-sm',
    },
  };

  const styles = sizeStyles[size];

  return (
    <GlassCard variant="subtle" className={styles.padding}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`${styles.titleSize} font-medium text-foreground-secondary uppercase tracking-wide`}>
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`${styles.valueSize} font-bold text-foreground`}>
              {value}
            </span>
            {trend && (
              <span
                className={`text-xs font-medium ${
                  trend.isPositive ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-foreground-secondary">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`${styles.iconSize} flex items-center justify-center rounded-xl bg-foreground/5`}>
          <Icon className={`${styles.iconInner} ${iconColor}`} />
        </div>
      </div>
    </GlassCard>
  );
}

interface MetricsGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5;
}

export function MetricsGrid({ children, columns = 4 }: MetricsGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-5',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-3`}>
      {children}
    </div>
  );
}

interface HighlightCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  gradient?: 'primary' | 'success' | 'warning';
}

export function HighlightCard({
  title,
  value,
  description,
  icon: Icon,
  gradient = 'primary',
}: HighlightCardProps) {
  const gradients = {
    primary: 'from-primary/20 to-primary/5',
    success: 'from-green-500/20 to-green-500/5',
    warning: 'from-amber-500/20 to-amber-500/5',
  };

  const iconColors = {
    primary: 'text-primary',
    success: 'text-green-400',
    warning: 'text-amber-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradients[gradient]} p-6`}
    >
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-foreground-secondary">
          <Icon className={`h-5 w-5 ${iconColors[gradient]}`} />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="mt-3">
          <span className="text-4xl font-bold text-foreground">{value}</span>
        </div>
        <p className="mt-2 text-sm text-foreground-secondary">
          {description}
        </p>
      </div>
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/5" />
      <div className="absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-white/5" />
    </motion.div>
  );
}
