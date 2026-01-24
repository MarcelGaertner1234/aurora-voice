'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Check, ChevronDown, Eye, EyeOff, RotateCcw, FolderOpen, CheckCircle, XCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { useAppStore } from '@/lib/store/settings';
import { MODEL_OPTIONS } from '@/lib/ai/enrich';
import { UsageStats } from './usage-stats';
import type { LLMProvider, Mode } from '@/types';
import { MODE_CONFIG } from '@/types';

export function SettingsPanel() {
  const { settings, updateSettings, isSettingsOpen, setIsSettingsOpen } = useAppStore();
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [promptTab, setPromptTab] = useState<Mode>('notes');
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);

  // Check if vault exists when path changes
  const checkVaultExists = async (path: string | null) => {
    if (!path) {
      setVaultExists(null);
      return;
    }
    try {
      const pathExists = await exists(path);
      setVaultExists(pathExists);
    } catch {
      setVaultExists(false);
    }
  };

  // Select Obsidian vault folder
  const handleSelectVault = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Obsidian Vault auswählen',
      });
      if (selected && typeof selected === 'string') {
        updateSettings({ obsidianVaultPath: selected });
        checkVaultExists(selected);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  // Reset custom prompt for a mode
  const resetPrompt = (mode: Mode) => {
    updateSettings({
      customPrompts: {
        ...settings.customPrompts,
        [mode]: null,
      },
    });
  };

  // Update custom prompt for a mode
  const updatePrompt = (mode: Mode, value: string) => {
    updateSettings({
      customPrompts: {
        ...settings.customPrompts,
        [mode]: value || null,
      },
    });
  };

  const providers: { value: LLMProvider; label: string }[] = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic (Claude)' },
    { value: 'ollama', label: 'Ollama (Local)' },
  ];

  const toggleShowKey = (key: string) => {
    setShowApiKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <Dialog.Trigger asChild>
        <button
          className="rounded-full p-2 text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </Dialog.Trigger>

      <AnimatePresence>
        {isSettingsOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-xl)] glass p-6"
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
              >
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title className="text-xl font-semibold">
                    Einstellungen
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      className="rounded-full p-2 text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="space-y-6">
                  {/* LLM Provider Selection */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      LLM Provider
                    </h3>

                    <Select.Root
                      value={settings.selectedProvider}
                      onValueChange={(value: LLMProvider) => {
                        updateSettings({
                          selectedProvider: value,
                          selectedModel: MODEL_OPTIONS[value][0].value,
                        });
                      }}
                    >
                      <Select.Trigger className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm">
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                        </Select.Icon>
                      </Select.Trigger>

                      <Select.Portal>
                        <Select.Content className="z-[100] overflow-hidden rounded-[var(--radius-md)] bg-background-secondary shadow-lg">
                          <Select.Viewport className="p-1">
                            {providers.map((provider) => (
                              <Select.Item
                                key={provider.value}
                                value={provider.value}
                                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none hover:bg-primary hover:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                              >
                                <Select.ItemIndicator>
                                  <Check className="h-4 w-4" />
                                </Select.ItemIndicator>
                                <Select.ItemText>{provider.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </section>

                  {/* Model Selection */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Modell
                    </h3>

                    <Select.Root
                      value={settings.selectedModel}
                      onValueChange={(value) => updateSettings({ selectedModel: value })}
                    >
                      <Select.Trigger className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm">
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                        </Select.Icon>
                      </Select.Trigger>

                      <Select.Portal>
                        <Select.Content className="z-[100] overflow-hidden rounded-[var(--radius-md)] bg-background-secondary shadow-lg">
                          <Select.Viewport className="p-1">
                            {MODEL_OPTIONS[settings.selectedProvider].map((model) => (
                              <Select.Item
                                key={model.value}
                                value={model.value}
                                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none hover:bg-primary hover:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                              >
                                <Select.ItemIndicator>
                                  <Check className="h-4 w-4" />
                                </Select.ItemIndicator>
                                <Select.ItemText>{model.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </section>

                  {/* API Keys */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      API Keys
                    </h3>

                    {/* OpenAI API Key */}
                    <div className="space-y-2">
                      <label className="text-xs text-foreground-secondary">
                        OpenAI API Key (für Whisper & GPT)
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey.openai ? 'text' : 'password'}
                          value={settings.openaiApiKey}
                          onChange={(e) =>
                            updateSettings({ openaiApiKey: e.target.value })
                          }
                          placeholder="sk-..."
                          className="w-full rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 pr-10 text-sm placeholder:text-foreground-secondary/50"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowKey('openai')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-secondary hover:text-foreground"
                        >
                          {showApiKey.openai ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Anthropic API Key */}
                    {settings.selectedProvider === 'anthropic' && (
                      <div className="space-y-2">
                        <label className="text-xs text-foreground-secondary">
                          Anthropic API Key
                        </label>
                        <div className="relative">
                          <input
                            type={showApiKey.anthropic ? 'text' : 'password'}
                            value={settings.anthropicApiKey}
                            onChange={(e) =>
                              updateSettings({ anthropicApiKey: e.target.value })
                            }
                            placeholder="sk-ant-..."
                            className="w-full rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 pr-10 text-sm placeholder:text-foreground-secondary/50"
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowKey('anthropic')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-secondary hover:text-foreground"
                          >
                            {showApiKey.anthropic ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Ollama URL */}
                    {settings.selectedProvider === 'ollama' && (
                      <div className="space-y-2">
                        <label className="text-xs text-foreground-secondary">
                          Ollama Server URL
                        </label>
                        <input
                          type="text"
                          value={settings.ollamaBaseUrl}
                          onChange={(e) =>
                            updateSettings({ ollamaBaseUrl: e.target.value })
                          }
                          placeholder="http://localhost:11434"
                          className="w-full rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm placeholder:text-foreground-secondary/50"
                        />
                      </div>
                    )}
                  </section>

                  {/* Language */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Sprache
                    </h3>

                    <Select.Root
                      value={settings.language}
                      onValueChange={(value) => updateSettings({ language: value })}
                    >
                      <Select.Trigger className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm">
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4 text-foreground-secondary" />
                        </Select.Icon>
                      </Select.Trigger>

                      <Select.Portal>
                        <Select.Content className="z-[100] overflow-hidden rounded-[var(--radius-md)] bg-background-secondary shadow-lg">
                          <Select.Viewport className="p-1">
                            {[
                              { value: 'auto', label: 'Auto-Erkennung' },
                              { value: 'de', label: 'Deutsch' },
                              { value: 'en', label: 'English' },
                              { value: 'fr', label: 'Français' },
                              { value: 'es', label: 'Español' },
                            ].map((lang) => (
                              <Select.Item
                                key={lang.value}
                                value={lang.value}
                                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none hover:bg-primary hover:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
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
                  </section>

                  {/* Window Options */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Fenster
                    </h3>

                    <div className="flex items-center justify-between">
                      <label className="text-sm">Immer im Vordergrund</label>
                      <Switch.Root
                        checked={settings.alwaysOnTop}
                        onCheckedChange={(checked) =>
                          updateSettings({ alwaysOnTop: checked })
                        }
                        className="h-6 w-11 rounded-full bg-background-secondary data-[state=checked]:bg-primary"
                      >
                        <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
                      </Switch.Root>
                    </div>
                  </section>

                  {/* Speaker Detection */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Sprecher-Erkennung
                    </h3>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm">Automatische Erkennung</label>
                        <p className="text-xs text-foreground-secondary">
                          Erkennt Sprecher während der Aufnahme
                        </p>
                      </div>
                      <Switch.Root
                        checked={settings.autoSpeakerDetection ?? true}
                        onCheckedChange={(checked) =>
                          updateSettings({ autoSpeakerDetection: checked })
                        }
                        className="h-6 w-11 rounded-full bg-background-secondary data-[state=checked]:bg-primary"
                      >
                        <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
                      </Switch.Root>
                    </div>

                    {(settings.autoSpeakerDetection ?? true) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-foreground-secondary">
                            Konfidenz-Schwelle: {Math.round((settings.speakerDetectionConfidenceThreshold ?? 0.6) * 100)}%
                          </label>
                        </div>
                        <input
                          type="range"
                          min="0.4"
                          max="0.9"
                          step="0.05"
                          value={settings.speakerDetectionConfidenceThreshold ?? 0.6}
                          onChange={(e) =>
                            updateSettings({ speakerDetectionConfidenceThreshold: parseFloat(e.target.value) })
                          }
                          className="w-full h-2 bg-background-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-xs text-foreground-secondary">
                          Niedrigere Werte = mehr Vorschläge, höhere Werte = genauere Vorschläge
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Custom Prompts */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Prompts anpassen
                    </h3>

                    <Tabs.Root value={promptTab} onValueChange={(v) => setPromptTab(v as Mode)}>
                      <Tabs.List className="flex gap-1 rounded-[var(--radius-md)] bg-background-secondary p-1">
                        {(['notes', 'meeting', 'code'] as Mode[]).map((mode) => (
                          <Tabs.Trigger
                            key={mode}
                            value={mode}
                            className="flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-white"
                          >
                            {MODE_CONFIG[mode].label}
                          </Tabs.Trigger>
                        ))}
                      </Tabs.List>

                      {(['notes', 'meeting', 'code'] as Mode[]).map((mode) => (
                        <Tabs.Content key={mode} value={mode} className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-foreground-secondary">
                              {settings.customPrompts?.[mode] ? 'Eigener Prompt' : 'Standard-Prompt wird verwendet'}
                            </label>
                            {settings.customPrompts?.[mode] && (
                              <button
                                type="button"
                                onClick={() => resetPrompt(mode)}
                                className="flex items-center gap-1 text-xs text-foreground-secondary hover:text-foreground"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Zurücksetzen
                              </button>
                            )}
                          </div>
                          <textarea
                            value={settings.customPrompts?.[mode] || ''}
                            onChange={(e) => updatePrompt(mode, e.target.value)}
                            placeholder={MODE_CONFIG[mode].prompt}
                            className="w-full rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm placeholder:text-foreground-secondary/50 resize-none"
                            rows={6}
                          />
                        </Tabs.Content>
                      ))}
                    </Tabs.Root>
                  </section>

                  {/* Obsidian Integration */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Obsidian Integration
                    </h3>

                    <div className="space-y-2">
                      <label className="text-xs text-foreground-secondary">
                        Vault-Pfad
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSelectVault}
                          className="flex-1 flex items-center gap-2 rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm text-left hover:bg-foreground/5"
                        >
                          <FolderOpen className="h-4 w-4 text-foreground-secondary" />
                          {settings.obsidianVaultPath ? (
                            <span className="truncate">{settings.obsidianVaultPath.split('/').pop()}</span>
                          ) : (
                            <span className="text-foreground-secondary">Vault auswählen...</span>
                          )}
                        </button>
                        {settings.obsidianVaultPath && (
                          <button
                            type="button"
                            onClick={() => {
                              updateSettings({ obsidianVaultPath: null });
                              setVaultExists(null);
                            }}
                            className="rounded-[var(--radius-md)] bg-background-secondary px-3 py-3 text-foreground-secondary hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {settings.obsidianVaultPath && (
                        <div className="flex items-center gap-2 text-xs">
                          {vaultExists === true ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5 text-success" />
                              <span className="text-success">Vault gefunden</span>
                            </>
                          ) : vaultExists === false ? (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-error" />
                              <span className="text-error">Vault nicht gefunden</span>
                            </>
                          ) : (
                            <span className="text-foreground-secondary">{settings.obsidianVaultPath}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-foreground-secondary">
                        Unterordner im Vault
                      </label>
                      <input
                        type="text"
                        value={settings.obsidianSubfolder ?? 'Aurora'}
                        onChange={(e) => updateSettings({ obsidianSubfolder: e.target.value })}
                        placeholder="Aurora"
                        className="w-full rounded-[var(--radius-md)] bg-background-secondary px-4 py-3 text-sm placeholder:text-foreground-secondary/50"
                      />
                    </div>
                  </section>

                  {/* Usage Statistics */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-secondary">
                      Nutzungsstatistiken
                    </h3>
                    <UsageStats />
                  </section>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
