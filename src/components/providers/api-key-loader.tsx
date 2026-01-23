'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store/settings';

export function ApiKeyLoader({ children }: { children: React.ReactNode }) {
  const loadApiKeys = useAppStore((state) => state.loadApiKeys);
  const apiKeysLoaded = useAppStore((state) => state.apiKeysLoaded);

  useEffect(() => {
    if (!apiKeysLoaded) {
      loadApiKeys();
    }
  }, [loadApiKeys, apiKeysLoaded]);

  // Always render children to allow Next.js Router to initialize
  // Components that need API keys can check apiKeysLoaded state themselves
  return <>{children}</>;
}
