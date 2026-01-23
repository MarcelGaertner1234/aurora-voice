// Voice Activity Detection for Aurora Meeting Assistant

import { getSharedAudioContext } from './audio-context';

export interface VADOptions {
  /** Threshold for detecting speech (0-1, default: 0.15) */
  speechThreshold?: number;
  /** Threshold for detecting silence (0-1, default: 0.05) */
  silenceThreshold?: number;
  /** Minimum speech duration in ms to trigger start (default: 200) */
  minSpeechDuration?: number;
  /** Minimum silence duration in ms to trigger end (default: 500) */
  minSilenceDuration?: number;
  /** Smoothing factor for level (0-1, default: 0.8) */
  smoothingFactor?: number;
  /** Callback when speech starts */
  onSpeechStart?: () => void;
  /** Callback when speech ends */
  onSpeechEnd?: (duration: number) => void;
  /** Callback with current audio level */
  onAudioLevel?: (level: number) => void;
  /** Callback with speech probability */
  onSpeechProbability?: (probability: number) => void;
}

export interface VADState {
  isSpeaking: boolean;
  speechDuration: number;
  silenceDuration: number;
  audioLevel: number;
  speechProbability: number;
}

const DEFAULT_OPTIONS: Required<Omit<VADOptions, 'onSpeechStart' | 'onSpeechEnd' | 'onAudioLevel' | 'onSpeechProbability'>> = {
  speechThreshold: 0.15,
  silenceThreshold: 0.05,
  minSpeechDuration: 200,
  minSilenceDuration: 500,
  smoothingFactor: 0.8,
};

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private animationFrame: number | null = null;
  private options: Required<Omit<VADOptions, 'onSpeechStart' | 'onSpeechEnd' | 'onAudioLevel' | 'onSpeechProbability'>>;
  private callbacks: Pick<VADOptions, 'onSpeechStart' | 'onSpeechEnd' | 'onAudioLevel' | 'onSpeechProbability'>;

  private state: VADState = {
    isSpeaking: false,
    speechDuration: 0,
    silenceDuration: 0,
    audioLevel: 0,
    speechProbability: 0,
  };

  private lastUpdateTime: number = 0;
  private speechStartTime: number = 0;
  private smoothedLevel: number = 0;

  // Frequency weights for better voice detection (focus on voice frequencies 85-255 Hz fundamental, 300-3400 Hz formants)
  private voiceFrequencyWeights: Float32Array | null = null;

  constructor(options: VADOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.callbacks = {
      onSpeechStart: options.onSpeechStart,
      onSpeechEnd: options.onSpeechEnd,
      onAudioLevel: options.onAudioLevel,
      onSpeechProbability: options.onSpeechProbability,
    };
  }

  async start(existingStream?: MediaStream): Promise<void> {
    try {
      // Use existing stream or request new one
      this.stream = existingStream || await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Use shared audio context to prevent multiple instances
      this.audioContext = getSharedAudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.5;

      // Create frequency weights for voice detection
      this.createVoiceFrequencyWeights();

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      this.lastUpdateTime = performance.now();
      this.startMonitoring();
    } catch (error) {
      throw new Error(`Failed to start VAD: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Stop stream tracks to release microphone
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Don't close the shared AudioContext - other components may still use it
    // Just release our reference
    this.audioContext = null;
    this.analyser = null;
    this.voiceFrequencyWeights = null;

    // Trigger speech end if currently speaking
    if (this.state.isSpeaking) {
      const duration = performance.now() - this.speechStartTime;
      this.state.isSpeaking = false;
      this.callbacks.onSpeechEnd?.(duration);
    }

    this.resetState();
  }

  getState(): VADState {
    return { ...this.state };
  }

  private createVoiceFrequencyWeights(): void {
    if (!this.analyser || !this.audioContext) return;

    const binCount = this.analyser.frequencyBinCount;
    const sampleRate = this.audioContext.sampleRate;
    const binWidth = sampleRate / (binCount * 2);

    this.voiceFrequencyWeights = new Float32Array(binCount);

    for (let i = 0; i < binCount; i++) {
      const freq = i * binWidth;

      // Weight frequencies based on typical voice range
      if (freq < 85) {
        // Below voice range - low weight
        this.voiceFrequencyWeights[i] = 0.2;
      } else if (freq >= 85 && freq < 300) {
        // Fundamental frequency range - medium weight
        this.voiceFrequencyWeights[i] = 0.8;
      } else if (freq >= 300 && freq < 3400) {
        // Formant frequencies - highest weight
        this.voiceFrequencyWeights[i] = 1.0;
      } else if (freq >= 3400 && freq < 6000) {
        // Upper harmonics - medium weight
        this.voiceFrequencyWeights[i] = 0.5;
      } else {
        // Above voice range - low weight
        this.voiceFrequencyWeights[i] = 0.1;
      }
    }
  }

  private startMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      // Cache the analyser reference to prevent race conditions with stop()
      const analyser = this.analyser;
      if (!analyser) return;

      const now = performance.now();
      const deltaTime = now - this.lastUpdateTime;
      this.lastUpdateTime = now;

      analyser.getByteFrequencyData(dataArray);

      // Calculate weighted average for voice detection
      let weightedSum = 0;
      let weightSum = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const weight = this.voiceFrequencyWeights?.[i] ?? 1;
        weightedSum += (dataArray[i] / 255) * weight;
        weightSum += weight;
      }

      const rawLevel = weightSum > 0 ? weightedSum / weightSum : 0;

      // Apply smoothing
      this.smoothedLevel = this.smoothedLevel * this.options.smoothingFactor +
        rawLevel * (1 - this.options.smoothingFactor);

      this.state.audioLevel = this.smoothedLevel;
      this.callbacks.onAudioLevel?.(this.smoothedLevel);

      // Calculate speech probability based on level relative to thresholds
      const range = this.options.speechThreshold - this.options.silenceThreshold;
      const probability = Math.max(0, Math.min(1,
        (this.smoothedLevel - this.options.silenceThreshold) / range
      ));
      this.state.speechProbability = probability;
      this.callbacks.onSpeechProbability?.(probability);

      // Update speech/silence durations
      const isSpeechLevel = this.smoothedLevel >= this.options.speechThreshold;
      const isSilenceLevel = this.smoothedLevel < this.options.silenceThreshold;

      if (isSpeechLevel) {
        this.state.speechDuration += deltaTime;
        this.state.silenceDuration = 0;
      } else if (isSilenceLevel) {
        this.state.silenceDuration += deltaTime;
        // Don't reset speech duration immediately - only after confirmed silence
      }

      // State transitions
      if (!this.state.isSpeaking) {
        // Check for speech start
        if (this.state.speechDuration >= this.options.minSpeechDuration) {
          this.state.isSpeaking = true;
          this.speechStartTime = now - this.state.speechDuration;
          this.callbacks.onSpeechStart?.();
        }
      } else {
        // Check for speech end
        if (this.state.silenceDuration >= this.options.minSilenceDuration) {
          this.state.isSpeaking = false;
          const duration = now - this.speechStartTime - this.state.silenceDuration;
          this.state.speechDuration = 0;
          this.callbacks.onSpeechEnd?.(duration);
        }
      }

      this.animationFrame = requestAnimationFrame(update);
    };

    update();
  }

  private resetState(): void {
    this.state = {
      isSpeaking: false,
      speechDuration: 0,
      silenceDuration: 0,
      audioLevel: 0,
      speechProbability: 0,
    };
    this.smoothedLevel = 0;
    this.speechStartTime = 0;
  }

  // Update thresholds dynamically (useful for calibration)
  setThresholds(speechThreshold: number, silenceThreshold: number): void {
    this.options.speechThreshold = Math.max(0, Math.min(1, speechThreshold));
    this.options.silenceThreshold = Math.max(0, Math.min(1, silenceThreshold));
  }
}

// Utility: Auto-calibrate thresholds based on ambient noise
export async function calibrateVAD(
  duration: number = 2000,
  onProgress?: (progress: number) => void
): Promise<{ speechThreshold: number; silenceThreshold: number }> {
  return new Promise(async (resolve, reject) => {
    try {
      const levels: number[] = [];
      const startTime = performance.now();

      const vad = new VoiceActivityDetector({
        onAudioLevel: (level) => {
          levels.push(level);
          const progress = Math.min(1, (performance.now() - startTime) / duration);
          onProgress?.(progress);
        },
      });

      await vad.start();

      setTimeout(() => {
        vad.stop();

        if (levels.length === 0) {
          resolve({ speechThreshold: 0.15, silenceThreshold: 0.05 });
          return;
        }

        // Calculate statistics
        const sorted = [...levels].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const max = sorted[sorted.length - 1];
        const p90 = sorted[Math.floor(sorted.length * 0.9)];

        // Set silence threshold slightly above ambient noise
        const silenceThreshold = Math.min(0.1, median * 1.5);

        // Set speech threshold between noise floor and max observed
        const speechThreshold = Math.max(
          silenceThreshold + 0.05,
          Math.min(0.3, p90 * 1.2)
        );

        resolve({ speechThreshold, silenceThreshold });
      }, duration);
    } catch (error) {
      reject(error);
    }
  });
}
