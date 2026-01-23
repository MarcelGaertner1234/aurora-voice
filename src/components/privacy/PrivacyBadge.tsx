'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Lock, Cloud, Server, ChevronRight, Shield, Info } from 'lucide-react';
import { useAppStore } from '@/lib/store/settings';
import { getPrivacyStatus } from '@/lib/privacy/data-export';

export function PrivacyBadge() {
  const router = useRouter();
  const { settings } = useAppStore();
  const [showTooltip, setShowTooltip] = useState(false);

  const status = getPrivacyStatus(settings.selectedProvider);
  const isLocal = status.provider === 'local';

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => router.push('/settings/privacy')}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all hover:scale-105 ${
          isLocal
            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
        }`}
      >
        {isLocal ? (
          <Lock className="h-3 w-3" />
        ) : (
          <Cloud className="h-3 w-3" />
        )}
        <span>{isLocal ? 'Lokal' : 'Cloud'}</span>
      </button>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-72"
          >
            <div className="rounded-xl bg-background-secondary border border-white/10 p-4 shadow-xl">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                  isLocal ? 'bg-green-500/20' : 'bg-amber-500/20'
                }`}>
                  {isLocal ? (
                    <Server className="h-4 w-4 text-green-400" />
                  ) : (
                    <Cloud className="h-4 w-4 text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {status.providerName}
                  </div>
                  <div className="text-xs text-foreground-secondary">
                    {isLocal ? 'Offline-Modus' : 'Cloud-Verarbeitung'}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-foreground-secondary mb-3">
                {status.description}
              </p>

              {/* Data Location */}
              <div className="flex items-start gap-2 p-2 rounded-lg bg-foreground/5 mb-3">
                <Shield className="h-4 w-4 text-foreground-secondary mt-0.5" />
                <div className="text-xs text-foreground-secondary">
                  {status.dataLocation}
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => router.push('/settings/privacy')}
                className="flex items-center justify-between w-full p-2 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                <span>Privacy-Einstellungen öffnen</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PrivacyInfoBannerProps {
  provider: 'openai' | 'anthropic' | 'ollama';
}

export function PrivacyInfoBanner({ provider }: PrivacyInfoBannerProps) {
  const status = getPrivacyStatus(provider);

  if (status.provider === 'local') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <Lock className="h-4 w-4 text-green-400" />
        <div className="flex-1">
          <div className="text-sm font-medium text-green-400">Vollständig lokal</div>
          <div className="text-xs text-foreground-secondary">
            Alle Daten bleiben auf Ihrem Gerät. Keine Internetverbindung erforderlich.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <Info className="h-4 w-4 text-amber-400" />
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-400">Cloud-Verarbeitung</div>
        <div className="text-xs text-foreground-secondary">
          {status.dataLocation}
        </div>
      </div>
    </div>
  );
}
