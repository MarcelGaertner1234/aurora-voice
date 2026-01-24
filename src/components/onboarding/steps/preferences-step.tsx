'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Globe, Keyboard } from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import type { StepProps } from '@/hooks/use-onboarding';

const languages = [
  { value: 'auto', label: 'Automatisch erkennen' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
];

export function PreferencesStep({ onNext, onBack }: StepProps) {
  const { settings, updateSettings } = useAppStore();

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">Einstellungen</h2>
        <p className="mt-2 text-sm text-foreground-secondary">
          Passe Aurora an deine Bedürfnisse an.
        </p>
      </div>

      {/* Settings */}
      <div className="space-y-4">
        {/* Language Selection */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-lg bg-background-secondary p-4"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">Sprache</h3>
              <p className="text-xs text-foreground-secondary">Für Transkription</p>
            </div>
          </div>

          <Select.Root
            value={settings.language}
            onValueChange={(value) => updateSettings({ language: value })}
          >
            <Select.Trigger className="flex w-full items-center justify-between rounded-lg bg-foreground/5 px-4 py-2.5 text-sm">
              <Select.Value />
              <Select.Icon>
                <ChevronDown className="h-4 w-4 text-foreground-secondary" />
              </Select.Icon>
            </Select.Trigger>

            <Select.Portal>
              <Select.Content
                className="overflow-hidden rounded-lg bg-background-secondary shadow-lg z-50"
                position="popper"
                sideOffset={4}
              >
                <Select.Viewport className="p-1">
                  {languages.map((lang) => (
                    <Select.Item
                      key={lang.value}
                      value={lang.value}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none hover:bg-primary hover:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                    >
                      <Select.ItemIndicator>
                        <Check className="h-4 w-4" />
                      </Select.ItemIndicator>
                      <Select.ItemText>{lang.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </motion.div>

        {/* Hotkey Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-lg bg-background-secondary p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10">
                <Keyboard className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">Global Hotkey</h3>
                <p className="text-xs text-foreground-secondary">
                  {settings.hotkey.replace('CommandOrControl', 'Cmd/Ctrl').replace('+', ' + ')}
                </p>
              </div>
            </div>
            <Switch.Root
              checked={settings.hotkeyEnabled}
              onCheckedChange={(checked) => updateSettings({ hotkeyEnabled: checked })}
              className="relative h-6 w-11 rounded-full bg-foreground/20 transition-colors data-[state=checked]:bg-primary"
            >
              <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
            </Switch.Root>
          </div>
        </motion.div>

        {/* Speaker Detection Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-lg bg-background-secondary p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">Sprecher-Erkennung</h3>
                <p className="text-xs text-foreground-secondary">
                  Automatische Zuordnung
                </p>
              </div>
            </div>
            <Switch.Root
              checked={settings.autoSpeakerDetection}
              onCheckedChange={(checked) => updateSettings({ autoSpeakerDetection: checked })}
              className="relative h-6 w-11 rounded-full bg-foreground/20 transition-colors data-[state=checked]:bg-primary"
            >
              <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
            </Switch.Root>
          </div>
        </motion.div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-foreground-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-medium transition-all hover:bg-primary/90"
        >
          Weiter
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
