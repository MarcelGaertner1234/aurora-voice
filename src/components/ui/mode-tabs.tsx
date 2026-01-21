'use client';

import { motion } from 'framer-motion';
import * as Tabs from '@radix-ui/react-tabs';
import { FileText, Users, Code } from 'lucide-react';
import type { Mode } from '@/types';
import { MODE_CONFIG } from '@/types';

interface ModeTabsProps {
  value: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

const icons = {
  notes: FileText,
  meeting: Users,
  code: Code,
};

export function ModeTabs({ value, onChange, disabled }: ModeTabsProps) {
  const modes: Mode[] = ['notes', 'meeting', 'code'];

  return (
    <Tabs.Root
      value={value}
      onValueChange={(v) => onChange(v as Mode)}
      className="w-full"
    >
      <Tabs.List className="glass relative flex rounded-[var(--radius-lg)] p-1">
        {/* Animated Background */}
        <motion.div
          className="absolute inset-1 z-0 rounded-[var(--radius-md)] bg-primary"
          layoutId="activeTab"
          style={{
            width: `calc(${100 / modes.length}% - 4px)`,
            left: `calc(${modes.indexOf(value) * (100 / modes.length)}% + 2px)`,
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
          }}
        />

        {modes.map((mode) => {
          const Icon = icons[mode];
          const config = MODE_CONFIG[mode];
          const isActive = value === mode;

          return (
            <Tabs.Trigger
              key={mode}
              value={mode}
              disabled={disabled}
              className={`
                relative z-10 flex flex-1 items-center justify-center gap-2
                rounded-[var(--radius-md)] px-4 py-3
                text-sm font-medium transition-colors
                ${isActive ? 'text-white' : 'text-foreground-secondary hover:text-foreground'}
                disabled:cursor-not-allowed disabled:opacity-50
              `}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{config.label}</span>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}
