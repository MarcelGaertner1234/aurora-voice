// Secure Store for API Keys using Tauri Plugin Store
// Provides encrypted storage for sensitive data like API keys

import { Store } from '@tauri-apps/plugin-store';
import { logger } from '@/lib/utils/logger';

const STORE_NAME = 'aurora-secrets.dat';

// Singleton store instance
let store: Store | null = null;

// Check if we're in a Tauri environment
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Get or create the store instance
async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load(STORE_NAME);
  }
  return store;
}

/**
 * Secure store for API keys and sensitive configuration
 * Uses Tauri's encrypted store in the app, falls back to localStorage in dev/web
 */
export const secureStore = {
  /**
   * Store a key securely
   */
  async setKey(key: string, value: string): Promise<void> {
    if (isTauri()) {
      try {
        const s = await getStore();
        await s.set(key, value);
        await s.save();
        logger.debug(`Secure store: Key '${key}' saved`);
      } catch (err) {
        logger.error(`Secure store: Failed to save key '${key}'`, err);
        throw err;
      }
    } else {
      // Fallback for web/dev mode - use localStorage (not secure, but works)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`aurora_secret_${key}`, value);
        logger.debug(`Secure store (fallback): Key '${key}' saved to localStorage`);
      }
    }
  },

  /**
   * Retrieve a key from secure storage
   */
  async getKey(key: string): Promise<string | null> {
    if (isTauri()) {
      try {
        const s = await getStore();
        const value = await s.get<string>(key);
        return value ?? null;
      } catch (err) {
        logger.error(`Secure store: Failed to get key '${key}'`, err);
        return null;
      }
    } else {
      // Fallback for web/dev mode
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(`aurora_secret_${key}`);
      }
      return null;
    }
  },

  /**
   * Delete a key from secure storage
   */
  async deleteKey(key: string): Promise<void> {
    if (isTauri()) {
      try {
        const s = await getStore();
        await s.delete(key);
        await s.save();
        logger.debug(`Secure store: Key '${key}' deleted`);
      } catch (err) {
        logger.error(`Secure store: Failed to delete key '${key}'`, err);
        throw err;
      }
    } else {
      // Fallback for web/dev mode
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`aurora_secret_${key}`);
        logger.debug(`Secure store (fallback): Key '${key}' deleted from localStorage`);
      }
    }
  },

  /**
   * Check if a key exists in secure storage
   */
  async hasKey(key: string): Promise<boolean> {
    const value = await this.getKey(key);
    return value !== null;
  },

  /**
   * Get all stored keys (for debugging/admin purposes)
   */
  async getAllKeys(): Promise<string[]> {
    if (isTauri()) {
      try {
        const s = await getStore();
        const keys = await s.keys();
        return keys;
      } catch (err) {
        logger.error('Secure store: Failed to get all keys', err);
        return [];
      }
    } else {
      // Fallback for web/dev mode
      if (typeof localStorage !== 'undefined') {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('aurora_secret_')) {
            keys.push(key.replace('aurora_secret_', ''));
          }
        }
        return keys;
      }
      return [];
    }
  },

  /**
   * Clear all stored keys (use with caution)
   */
  async clear(): Promise<void> {
    if (isTauri()) {
      try {
        const s = await getStore();
        await s.clear();
        await s.save();
        logger.info('Secure store: All keys cleared');
      } catch (err) {
        logger.error('Secure store: Failed to clear store', err);
        throw err;
      }
    } else {
      // Fallback for web/dev mode
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('aurora_secret_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        logger.info('Secure store (fallback): All keys cleared from localStorage');
      }
    }
  },
};

// API key specific helpers
export const apiKeyStore = {
  async setOpenAIKey(key: string): Promise<void> {
    await secureStore.setKey('openai_api_key', key);
  },

  async getOpenAIKey(): Promise<string | null> {
    return secureStore.getKey('openai_api_key');
  },

  async setAnthropicKey(key: string): Promise<void> {
    await secureStore.setKey('anthropic_api_key', key);
  },

  async getAnthropicKey(): Promise<string | null> {
    return secureStore.getKey('anthropic_api_key');
  },

  async clearAllApiKeys(): Promise<void> {
    await secureStore.deleteKey('openai_api_key');
    await secureStore.deleteKey('anthropic_api_key');
  },
};

export default secureStore;
