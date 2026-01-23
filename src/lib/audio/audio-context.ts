// Shared AudioContext Singleton for Aurora Meeting Assistant
// Prevents multiple AudioContext instances which can cause memory issues

let sharedAudioContext: AudioContext | null = null;

/**
 * Get the shared AudioContext singleton.
 * Creates a new one if it doesn't exist or is closed.
 */
export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

/**
 * Close the shared AudioContext and release resources.
 * Call this when completely done with audio processing.
 */
export async function closeSharedAudioContext(): Promise<void> {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    await sharedAudioContext.close();
    sharedAudioContext = null;
  }
}

/**
 * Resume the shared AudioContext if suspended.
 * Useful after user interaction (autoplay policy).
 */
export async function resumeSharedAudioContext(): Promise<void> {
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    await sharedAudioContext.resume();
  }
}
