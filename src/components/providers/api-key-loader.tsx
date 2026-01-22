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

  // BLOCK RENDERING until API keys are loaded
  if (!apiKeysLoaded) {
    return null; // Children won't render until keys are ready
  }

  return <>{children}</>;
}
