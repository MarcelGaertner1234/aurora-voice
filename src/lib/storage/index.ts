// Storage Module
// IndexedDB is the primary storage - Project FS is only used for export

export * from './provider';
export * from './aurora-fs';
export * from './indexeddb-provider';
export * from './project-exporter';
export * from './migration';

import type { StorageProvider } from './provider';
import { getIndexedDBProvider } from './indexeddb-provider';

// Get the storage provider - always returns IndexedDB provider
// Project FS is no longer used for storage, only for export
export function getStorageProvider(): StorageProvider {
  return getIndexedDBProvider();
}
