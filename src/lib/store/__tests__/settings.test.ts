import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../settings';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useAppStore.getState();
    store.resetSession();
    store.clearHistory();
  });

  describe('Recording State', () => {
    it('should have initial recording state as idle', () => {
      const { recordingState } = useAppStore.getState();
      expect(recordingState).toBe('idle');
    });

    it('should update recording state', () => {
      useAppStore.getState().setRecordingState('recording');
      expect(useAppStore.getState().recordingState).toBe('recording');
    });
  });

  describe('Current Mode', () => {
    it('should have default mode as notes', () => {
      const { currentMode } = useAppStore.getState();
      expect(currentMode).toBe('notes');
    });

    it('should update current mode', () => {
      useAppStore.getState().setCurrentMode('meeting');
      expect(useAppStore.getState().currentMode).toBe('meeting');
    });
  });

  describe('Transcript', () => {
    it('should have empty transcript initially', () => {
      const { transcript } = useAppStore.getState();
      expect(transcript).toBe('');
    });

    it('should update transcript', () => {
      useAppStore.getState().setTranscript('Hello, this is a test transcript');
      expect(useAppStore.getState().transcript).toBe('Hello, this is a test transcript');
    });
  });

  describe('Enriched Content', () => {
    it('should have empty enriched content initially', () => {
      const { enrichedContent } = useAppStore.getState();
      expect(enrichedContent).toBe('');
    });

    it('should set enriched content', () => {
      useAppStore.getState().setEnrichedContent('# Summary');
      expect(useAppStore.getState().enrichedContent).toBe('# Summary');
    });

    it('should append to enriched content', () => {
      useAppStore.getState().setEnrichedContent('Hello');
      useAppStore.getState().appendEnrichedContent(' World');
      expect(useAppStore.getState().enrichedContent).toBe('Hello World');
    });
  });

  describe('Settings', () => {
    it('should have default settings', () => {
      const { settings } = useAppStore.getState();
      expect(settings).toBeDefined();
      expect(settings.selectedProvider).toBeDefined();
    });

    it('should update settings partially', () => {
      const originalSettings = useAppStore.getState().settings;
      useAppStore.getState().updateSettings({ language: 'de' });
      const { settings } = useAppStore.getState();
      expect(settings.language).toBe('de');
      // Other settings should remain unchanged
      expect(settings.selectedProvider).toBe(originalSettings.selectedProvider);
    });
  });

  describe('Recent Projects', () => {
    it('should add a project to recent projects', () => {
      useAppStore.getState().addRecentProject('/path/to/project');
      const { settings } = useAppStore.getState();
      expect(settings.recentProjects).toContain('/path/to/project');
    });

    it('should not duplicate projects', () => {
      useAppStore.getState().addRecentProject('/path/to/project');
      useAppStore.getState().addRecentProject('/path/to/project');
      const { settings } = useAppStore.getState();
      const count = settings.recentProjects?.filter(p => p === '/path/to/project').length;
      expect(count).toBe(1);
    });

    it('should keep most recent projects first', () => {
      useAppStore.getState().addRecentProject('/project1');
      useAppStore.getState().addRecentProject('/project2');
      const { settings } = useAppStore.getState();
      expect(settings.recentProjects?.[0]).toBe('/project2');
    });
  });

  describe('History', () => {
    it('should have empty history initially', () => {
      const { history } = useAppStore.getState();
      expect(history).toEqual([]);
    });

    it('should add entry to history', () => {
      useAppStore.getState().addToHistory({
        mode: 'notes',
        originalTranscript: 'Test input',
        enrichedContent: 'Test output',
        timestamp: new Date(),
        duration: 60,
      });
      const { history } = useAppStore.getState();
      expect(history.length).toBe(1);
      expect(history[0].originalTranscript).toBe('Test input');
    });

    it('should clear history', () => {
      useAppStore.getState().addToHistory({
        mode: 'notes',
        originalTranscript: 'Test input',
        enrichedContent: 'Test output',
        timestamp: new Date(),
        duration: 60,
      });
      useAppStore.getState().clearHistory();
      const { history } = useAppStore.getState();
      expect(history).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should have no error initially', () => {
      const { error } = useAppStore.getState();
      expect(error).toBeNull();
    });

    it('should set and clear error', () => {
      useAppStore.getState().setError('Something went wrong');
      expect(useAppStore.getState().error).toBe('Something went wrong');

      useAppStore.getState().setError(null);
      expect(useAppStore.getState().error).toBeNull();
    });
  });

  describe('Reset Session', () => {
    it('should reset session state', () => {
      // Set some state
      useAppStore.getState().setRecordingState('recording');
      useAppStore.getState().setTranscript('Some transcript');
      useAppStore.getState().setEnrichedContent('Some content');
      useAppStore.getState().setError('Some error');

      // Reset
      useAppStore.getState().resetSession();

      // Verify reset
      const state = useAppStore.getState();
      expect(state.recordingState).toBe('idle');
      expect(state.transcript).toBe('');
      expect(state.enrichedContent).toBe('');
      expect(state.error).toBeNull();
    });
  });

  describe('Usage Stats', () => {
    it('should have default usage stats', () => {
      const { usageStats } = useAppStore.getState();
      expect(usageStats).toBeDefined();
      expect(usageStats.totalRecordings).toBe(0);
    });

    it('should add transcription usage', () => {
      useAppStore.getState().addTranscriptionUsage(120); // 2 minutes
      const { usageStats } = useAppStore.getState();
      expect(usageStats.totalTranscriptionMinutes).toBe(2);
      expect(usageStats.totalRecordings).toBe(1);
    });

    it('should reset usage stats', () => {
      useAppStore.getState().addTranscriptionUsage(60);
      useAppStore.getState().resetUsageStats();
      const { usageStats } = useAppStore.getState();
      expect(usageStats.totalRecordings).toBe(0);
      expect(usageStats.lastResetAt).toBeDefined();
    });
  });
});
