// Speaker Store for Aurora Meeting Assistant

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  SpeakerProfile,
  SpeakerCreateInput,
  SpeakerUpdateInput,
  SpeakerFilters,
  SpeakerStats,
} from '@/types/speaker';
import { getNextSpeakerColor } from '@/types/speaker';
import {
  getAllSpeakers,
  getSpeakerById,
  saveSpeaker,
  saveSpeakers,
  deleteSpeaker as dbDeleteSpeaker,
} from '@/lib/db';

interface SpeakerState {
  // Speakers list
  speakers: SpeakerProfile[];
  isLoading: boolean;
  error: string | null;

  // Filters
  filters: SpeakerFilters;
  filteredSpeakers: SpeakerProfile[];

  // Stats
  stats: SpeakerStats;

  // Actions - CRUD
  loadSpeakers: () => Promise<void>;
  getSpeaker: (id: string) => Promise<SpeakerProfile | undefined>;
  getSpeakerByName: (name: string) => SpeakerProfile | undefined;
  createSpeaker: (input: SpeakerCreateInput) => Promise<SpeakerProfile>;
  updateSpeaker: (id: string, input: SpeakerUpdateInput) => Promise<void>;
  deleteSpeaker: (id: string) => Promise<void>;

  // Actions - Bulk
  getOrCreateSpeakerByName: (name: string) => Promise<SpeakerProfile>;
  incrementMeetingCount: (id: string) => Promise<void>;
  updateSpeakingTime: (id: string, duration: number) => Promise<void>;
  updateLastSeen: (id: string) => Promise<void>;

  // Actions - Filters
  setFilters: (filters: SpeakerFilters) => void;
  clearFilters: () => void;

  // Actions - Stats
  refreshStats: () => void;

  // Actions - Error handling
  setError: (error: string | null) => void;
  clearError: () => void;
}

// Helper to filter speakers
function filterSpeakers(speakers: SpeakerProfile[], filters: SpeakerFilters): SpeakerProfile[] {
  return speakers.filter((speaker) => {
    // Search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesName = speaker.name.toLowerCase().includes(query);
      const matchesEmail = speaker.email?.toLowerCase().includes(query);
      if (!matchesName && !matchesEmail) {
        return false;
      }
    }

    // Min meeting count
    if (filters.minMeetingCount !== undefined && speaker.meetingCount < filters.minMeetingCount) {
      return false;
    }

    return true;
  });
}

// Calculate stats
function calculateStats(speakers: SpeakerProfile[]): SpeakerStats {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeSpeakers = speakers.filter(
    (s) => s.lastSeenAt && s.lastSeenAt > thirtyDaysAgo
  ).length;

  const totalMeetings = speakers.reduce((sum, s) => sum + s.meetingCount, 0);

  return {
    totalSpeakers: speakers.length,
    activeSpeakers,
    averageMeetingsPerSpeaker: speakers.length > 0 ? totalMeetings / speakers.length : 0,
  };
}

export const useSpeakerStore = create<SpeakerState>((set, get) => ({
  // Initial state
  speakers: [],
  isLoading: false,
  error: null,
  filters: {},
  filteredSpeakers: [],
  stats: {
    totalSpeakers: 0,
    activeSpeakers: 0,
    averageMeetingsPerSpeaker: 0,
  },

  // Load all speakers from IndexedDB
  loadSpeakers: async () => {
    set({ isLoading: true, error: null });
    try {
      const speakers = await getAllSpeakers();
      const { filters } = get();
      set({
        speakers,
        filteredSpeakers: filterSpeakers(speakers, filters),
        stats: calculateStats(speakers),
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load speakers',
        isLoading: false,
      });
    }
  },

  // Get a single speaker
  getSpeaker: async (id: string) => {
    try {
      return await getSpeakerById(id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to get speaker' });
      return undefined;
    }
  },

  // Get speaker by name (from local state)
  getSpeakerByName: (name: string) => {
    const { speakers } = get();
    return speakers.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
  },

  // Create a new speaker
  createSpeaker: async (input: SpeakerCreateInput) => {
    const { speakers } = get();
    const existingColors = speakers.map((s) => s.color);
    const now = new Date();

    const speaker: SpeakerProfile = {
      id: uuidv4(),
      name: input.name,
      email: input.email,
      color: input.color || getNextSpeakerColor(existingColors),
      meetingCount: 0,
      totalSpeakingTime: 0,
      voiceCharacteristics: input.voiceCharacteristics,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveSpeaker(speaker);
      set((state) => {
        const speakers = [...state.speakers, speaker];
        return {
          speakers,
          filteredSpeakers: filterSpeakers(speakers, state.filters),
          stats: calculateStats(speakers),
        };
      });
      return speaker;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create speaker' });
      throw err;
    }
  },

  // Update a speaker
  updateSpeaker: async (id: string, input: SpeakerUpdateInput) => {
    const speaker = await getSpeakerById(id);
    if (!speaker) {
      throw new Error('Speaker not found');
    }

    const updated: SpeakerProfile = {
      ...speaker,
      ...input,
      updatedAt: new Date(),
    };

    try {
      await saveSpeaker(updated);
      set((state) => {
        const speakers = state.speakers.map((s) => (s.id === id ? updated : s));
        return {
          speakers,
          filteredSpeakers: filterSpeakers(speakers, state.filters),
          stats: calculateStats(speakers),
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update speaker' });
      throw err;
    }
  },

  // Delete a speaker
  deleteSpeaker: async (id: string) => {
    try {
      await dbDeleteSpeaker(id);
      set((state) => {
        const speakers = state.speakers.filter((s) => s.id !== id);
        return {
          speakers,
          filteredSpeakers: filterSpeakers(speakers, state.filters),
          stats: calculateStats(speakers),
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete speaker' });
      throw err;
    }
  },

  // Get or create speaker by name
  getOrCreateSpeakerByName: async (name: string) => {
    const existing = get().getSpeakerByName(name);
    if (existing) {
      return existing;
    }
    return get().createSpeaker({ name });
  },

  // Increment meeting count
  incrementMeetingCount: async (id: string) => {
    const speaker = await getSpeakerById(id);
    if (!speaker) return;

    const updated: SpeakerProfile = {
      ...speaker,
      meetingCount: speaker.meetingCount + 1,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };

    await saveSpeaker(updated);
    set((state) => {
      const speakers = state.speakers.map((s) => (s.id === id ? updated : s));
      return {
        speakers,
        filteredSpeakers: filterSpeakers(speakers, state.filters),
        stats: calculateStats(speakers),
      };
    });
  },

  // Update speaking time
  updateSpeakingTime: async (id: string, duration: number) => {
    const speaker = await getSpeakerById(id);
    if (!speaker) return;

    const updated: SpeakerProfile = {
      ...speaker,
      totalSpeakingTime: speaker.totalSpeakingTime + duration,
      updatedAt: new Date(),
    };

    await saveSpeaker(updated);
    set((state) => {
      const speakers = state.speakers.map((s) => (s.id === id ? updated : s));
      return {
        speakers,
        filteredSpeakers: filterSpeakers(speakers, state.filters),
        stats: calculateStats(speakers),
      };
    });
  },

  // Update last seen
  updateLastSeen: async (id: string) => {
    const speaker = await getSpeakerById(id);
    if (!speaker) return;

    const updated: SpeakerProfile = {
      ...speaker,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };

    await saveSpeaker(updated);
    set((state) => {
      const speakers = state.speakers.map((s) => (s.id === id ? updated : s));
      return {
        speakers,
        filteredSpeakers: filterSpeakers(speakers, state.filters),
        stats: calculateStats(speakers),
      };
    });
  },

  // Set filters
  setFilters: (filters: SpeakerFilters) => {
    set((state) => ({
      filters,
      filteredSpeakers: filterSpeakers(state.speakers, filters),
    }));
  },

  // Clear filters
  clearFilters: () => {
    set((state) => ({
      filters: {},
      filteredSpeakers: state.speakers,
    }));
  },

  // Refresh stats
  refreshStats: () => {
    set((state) => ({
      stats: calculateStats(state.speakers),
    }));
  },

  // Error handling
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}));
