// Project Context Store for Aurora Voice
// Manages project file indexing cache for AI-enhanced features
// Projects are now per-meeting, not global

import { create } from 'zustand';
import type {
  ProjectContext,
  ProjectFile,
  IndexSettings,
} from '@/types/project';
import { DEFAULT_INDEX_SETTINGS } from '@/types/project';
import { indexProject } from '@/lib/project';

interface ProjectCacheEntry {
  context: ProjectContext;
  indexedAt: Date;
}

interface ProjectCacheState {
  // Cache of indexed projects (key = projectPath)
  projectCache: Map<string, ProjectCacheEntry>;

  // Indexing state per project
  indexingProjects: Map<string, boolean>;
  indexingProgress: Map<string, number>;
  indexingPhase: Map<string, string>;
  indexingErrors: Map<string, string>;

  // Fix C2: Promise-based mutex for concurrent indexing requests
  indexingPromises: Map<string, Promise<ProjectContext>>;

  // Global settings
  indexSettings: IndexSettings;

  // Actions
  getOrIndexProject: (path: string, onProgress?: (progress: number, phase: string) => void) => Promise<ProjectContext>;
  getCachedProject: (path: string) => ProjectContext | null;
  isProjectIndexing: (path: string) => boolean;
  getIndexingProgress: (path: string) => number;
  getIndexingPhase: (path: string) => string | null;
  getIndexingError: (path: string) => string | null;
  reindexProject: (path: string, onProgress?: (progress: number, phase: string) => void) => Promise<ProjectContext>;
  clearProjectFromCache: (path: string) => void;
  clearCache: () => void;
  updateIndexSettings: (settings: Partial<IndexSettings>) => void;
}

export const useProjectStore = create<ProjectCacheState>((set, get) => ({
  // Initial state
  projectCache: new Map(),
  indexingProjects: new Map(),
  indexingProgress: new Map(),
  indexingPhase: new Map(),
  indexingErrors: new Map(),
  indexingPromises: new Map(), // Fix C2: Promise-based mutex
  indexSettings: DEFAULT_INDEX_SETTINGS,

  // Get cached project or index it (Fix C2: Use Promise-based mutex to prevent race conditions)
  getOrIndexProject: async (path: string, onProgress?: (progress: number, phase: string) => void) => {
    const { projectCache, indexingPromises, indexSettings } = get();

    // Return from cache if exists
    const cached = projectCache.get(path);
    if (cached) {
      return cached.context;
    }

    // Fix C2: If already indexing, wait for the existing promise instead of polling
    const existingPromise = indexingPromises.get(path);
    if (existingPromise) {
      return existingPromise;
    }

    // Fix C2: Create the indexing promise FIRST and store it atomically
    // This ensures concurrent calls will see and await the same promise
    const indexingPromise = (async (): Promise<ProjectContext> => {
      // Double-check cache after acquiring "lock"
      const recheckedCache = get().projectCache.get(path);
      if (recheckedCache) {
        return recheckedCache.context;
      }

      // Set indexing state
      set((state) => {
        const newIndexing = new Map(state.indexingProjects);
        const newProgress = new Map(state.indexingProgress);
        const newPhase = new Map(state.indexingPhase);
        const newErrors = new Map(state.indexingErrors);
        newIndexing.set(path, true);
        newProgress.set(path, 0);
        newPhase.set(path, 'Starte Indizierung...');
        newErrors.delete(path);
        return {
          indexingProjects: newIndexing,
          indexingProgress: newProgress,
          indexingPhase: newPhase,
          indexingErrors: newErrors,
        };
      });

      try {
        const context = await indexProject(path, indexSettings, (progress, phase) => {
          set((state) => {
            const newProgress = new Map(state.indexingProgress);
            const newPhase = new Map(state.indexingPhase);
            newProgress.set(path, progress);
            newPhase.set(path, phase);
            return { indexingProgress: newProgress, indexingPhase: newPhase };
          });
          onProgress?.(progress, phase);
        });

        // Store in cache and cleanup
        set((state) => {
          const newCache = new Map(state.projectCache);
          const newIndexing = new Map(state.indexingProjects);
          const newPromises = new Map(state.indexingPromises);
          newCache.set(path, { context, indexedAt: new Date() });
          newIndexing.set(path, false);
          newPromises.delete(path);
          return {
            projectCache: newCache,
            indexingProjects: newIndexing,
            indexingPromises: newPromises,
          };
        });

        return context;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Indexing failed';
        set((state) => {
          const newIndexing = new Map(state.indexingProjects);
          const newErrors = new Map(state.indexingErrors);
          const newPromises = new Map(state.indexingPromises);
          newIndexing.set(path, false);
          newErrors.set(path, errorMessage);
          newPromises.delete(path);
          return {
            indexingProjects: newIndexing,
            indexingErrors: newErrors,
            indexingPromises: newPromises,
          };
        });
        throw err;
      }
    })();

    // Fix C2: Store promise atomically BEFORE awaiting
    set((state) => {
      const newPromises = new Map(state.indexingPromises);
      newPromises.set(path, indexingPromise);
      return { indexingPromises: newPromises };
    });

    return indexingPromise;
  },

  // Get project from cache (returns null if not cached)
  getCachedProject: (path: string) => {
    const { projectCache } = get();
    const cached = projectCache.get(path);
    return cached?.context ?? null;
  },

  // Check if project is currently being indexed
  isProjectIndexing: (path: string) => {
    const { indexingProjects } = get();
    return indexingProjects.get(path) || false;
  },

  // Get indexing progress for a project
  getIndexingProgress: (path: string) => {
    const { indexingProgress } = get();
    return indexingProgress.get(path) || 0;
  },

  // Get indexing phase for a project
  getIndexingPhase: (path: string) => {
    const { indexingPhase } = get();
    return indexingPhase.get(path) || null;
  },

  // Get indexing error for a project
  getIndexingError: (path: string) => {
    const { indexingErrors } = get();
    return indexingErrors.get(path) || null;
  },

  // Force reindex a project
  reindexProject: async (path: string, onProgress?: (progress: number, phase: string) => void) => {
    // Clear from cache first
    set((state) => {
      const newCache = new Map(state.projectCache);
      newCache.delete(path);
      return { projectCache: newCache };
    });

    // Then index
    return get().getOrIndexProject(path, onProgress);
  },

  // Remove a specific project from cache
  clearProjectFromCache: (path: string) => {
    set((state) => {
      const newCache = new Map(state.projectCache);
      const newProgress = new Map(state.indexingProgress);
      const newPhase = new Map(state.indexingPhase);
      const newErrors = new Map(state.indexingErrors);
      newCache.delete(path);
      newProgress.delete(path);
      newPhase.delete(path);
      newErrors.delete(path);
      return {
        projectCache: newCache,
        indexingProgress: newProgress,
        indexingPhase: newPhase,
        indexingErrors: newErrors,
      };
    });
  },

  // Clear entire cache
  clearCache: () => {
    set({
      projectCache: new Map(),
      indexingProjects: new Map(),
      indexingProgress: new Map(),
      indexingPhase: new Map(),
      indexingErrors: new Map(),
      indexingPromises: new Map(), // Fix C2: Also clear promise map
    });
  },

  // Update index settings
  updateIndexSettings: (settings: Partial<IndexSettings>) => {
    set((state) => ({
      indexSettings: { ...state.indexSettings, ...settings },
    }));
  },
}));

// Hook for easier access to project context for a specific path
export function useProjectContext(projectPath: string | null | undefined) {
  const {
    getCachedProject,
    isProjectIndexing,
    getIndexingProgress,
    getIndexingPhase,
    getIndexingError,
  } = useProjectStore();

  if (!projectPath) {
    return {
      context: null,
      path: null,
      isIndexing: false,
      indexProgress: 0,
      indexPhase: null,
      error: null,
      isConfigured: false,
      hasIndex: false,
      fileCount: 0,
    };
  }

  const context = getCachedProject(projectPath);
  const isIndexing = isProjectIndexing(projectPath);
  const indexProgress = getIndexingProgress(projectPath);
  const indexPhase = getIndexingPhase(projectPath);
  const error = getIndexingError(projectPath);

  return {
    context,
    path: projectPath,
    isIndexing,
    indexProgress,
    indexPhase,
    error,
    isConfigured: true,
    hasIndex: !!context,
    fileCount: context?.files.length || 0,
  };
}
