'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'subtle' | 'solid';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const variantStyles = {
  default: 'glass',
  subtle: 'glass-subtle',
  solid: 'bg-background-secondary',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className = '', variant = 'default', padding = 'md', children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={`rounded-[var(--radius-lg)] ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
