// Audio Chunker for Streaming Transcription

export interface AudioChunk {
  id: string;
  blob: Blob;
  startTime: number;
  endTime: number;
  duration: number;
  index: number;
}

export interface AudioChunkerOptions {
  /** Target chunk duration in milliseconds (default: 5000 = 5 seconds) */
  chunkDuration?: number;
  /** Overlap between chunks in milliseconds (default: 500) */
  overlap?: number;
  /** Minimum chunk duration to emit (default: 1000) */
  minChunkDuration?: number;
  /** Maximum chunk duration before forced split (default: 15000) */
  maxChunkDuration?: number;
  /** MIME type for audio (default: auto-detect) */
  mimeType?: string;
  /** Callback when a chunk is ready */
  onChunk?: (chunk: AudioChunk) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<AudioChunkerOptions, 'onChunk' | 'onError' | 'mimeType'>> = {
  chunkDuration: 5000,
  overlap: 500,
  minChunkDuration: 1000,
  maxChunkDuration: 15000,
};

export class AudioChunker {
  private mediaRecorder: MediaRecorder | null = null;
  // Fix H6: Made protected so SmartAudioChunker can access the same stream for VAD
  protected stream: MediaStream | null = null;
  private options: Required<Omit<AudioChunkerOptions, 'onChunk' | 'onError' | 'mimeType'>>;
  private callbacks: Pick<AudioChunkerOptions, 'onChunk' | 'onError'>;
  private mimeType: string = 'audio/webm';

  private chunks: Blob[] = [];
  private chunkIndex: number = 0;
  private sessionStartTime: number = 0;
  private currentChunkStartTime: number = 0;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning: boolean = false;

  // For overlap handling
  private overlapBuffer: Blob[] = [];

  constructor(options: AudioChunkerOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.callbacks = {
      onChunk: options.onChunk,
      onError: options.onError,
    };
    if (options.mimeType) {
      this.mimeType = options.mimeType;
    }
  }

  async start(existingStream?: MediaStream): Promise<void> {
    if (this.isRunning) {
      throw new Error('Chunker is already running');
    }

    const createdStream = !existingStream; // Track if we created the stream
    try {
      this.stream = existingStream || await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType,
        audioBitsPerSecond: 128000,
      });

      this.chunks = [];
      this.overlapBuffer = [];
      this.chunkIndex = 0;
      this.sessionStartTime = performance.now();
      this.currentChunkStartTime = this.sessionStartTime;
      this.isRunning = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = () => {
        this.callbacks.onError?.(new Error('MediaRecorder error'));
      };

      // Start recording with frequent data collection for overlap support
      this.mediaRecorder.start(100); // Collect data every 100ms

      // Start chunk timer
      this.scheduleChunkEmit();
    } catch (error) {
      this.isRunning = false;
      // Clean up stream if we created it and an error occurred
      if (createdStream && this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      const err = error instanceof Error ? error : new Error('Failed to start chunker');
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  async stop(): Promise<AudioChunk | null> {
    if (!this.isRunning || !this.mediaRecorder) {
      return null;
    }

    this.isRunning = false;

    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Emit final chunk if there's data
        const finalChunk = this.emitCurrentChunk(true);
        this.cleanup();
        resolve(finalChunk);
      };

      this.mediaRecorder.stop();
    });
  }

  // Force emit current chunk (e.g., on speech end)
  async forceEmit(): Promise<AudioChunk | null> {
    if (!this.isRunning) return null;

    const chunk = this.emitCurrentChunk(false);

    // Reset timer
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
    }
    this.scheduleChunkEmit();

    return chunk;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getCurrentDuration(): number {
    return performance.now() - this.currentChunkStartTime;
  }

  private scheduleChunkEmit(): void {
    if (!this.isRunning) return;

    this.chunkTimer = setTimeout(() => {
      if (this.isRunning) {
        this.emitCurrentChunk(false);
        this.scheduleChunkEmit();
      }
    }, this.options.chunkDuration);
  }

  private emitCurrentChunk(isFinal: boolean): AudioChunk | null {
    const now = performance.now();
    const duration = now - this.currentChunkStartTime;

    // Skip if chunk is too short (unless final)
    if (!isFinal && duration < this.options.minChunkDuration) {
      return null;
    }

    if (this.chunks.length === 0 && this.overlapBuffer.length === 0) {
      return null;
    }

    // Combine overlap buffer with current chunks
    const allChunks = [...this.overlapBuffer, ...this.chunks];
    const blob = new Blob(allChunks, { type: this.mimeType });

    const chunk: AudioChunk = {
      id: `chunk-${Date.now()}-${this.chunkIndex}`,
      blob,
      startTime: this.currentChunkStartTime - this.sessionStartTime,
      endTime: now - this.sessionStartTime,
      duration,
      index: this.chunkIndex,
    };

    this.chunkIndex++;
    this.callbacks.onChunk?.(chunk);

    // Store overlap for next chunk
    if (!isFinal && this.options.overlap > 0) {
      // Keep last N milliseconds worth of data for overlap
      const overlapChunks = Math.ceil(this.options.overlap / 100); // Since we collect every 100ms
      this.overlapBuffer = this.chunks.slice(-overlapChunks);
    } else {
      this.overlapBuffer = [];
    }

    // Reset for next chunk
    this.chunks = [];
    this.currentChunkStartTime = now - (isFinal ? 0 : this.options.overlap);

    return chunk;
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.chunks = [];
    this.overlapBuffer = [];
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm';
  }
}

// Smart chunker that uses VAD to determine chunk boundaries
export interface SmartChunkerOptions extends AudioChunkerOptions {
  /** Speech threshold for VAD (default: 0.15) */
  speechThreshold?: number;
  /** Silence threshold for VAD (default: 0.05) */
  silenceThreshold?: number;
  /** Silence duration to trigger chunk emit (default: 800ms) */
  silenceDurationForChunk?: number;
}

export class SmartAudioChunker extends AudioChunker {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadAnimationFrame: number | null = null;
  private speechThreshold: number;
  private silenceThreshold: number;
  private silenceDurationForChunk: number;
  private currentSilenceDuration: number = 0;
  private lastUpdateTime: number = 0;
  private smoothedLevel: number = 0;

  constructor(options: SmartChunkerOptions = {}) {
    super(options);
    this.speechThreshold = options.speechThreshold ?? 0.15;
    this.silenceThreshold = options.silenceThreshold ?? 0.05;
    this.silenceDurationForChunk = options.silenceDurationForChunk ?? 800;
  }

  async start(existingStream?: MediaStream): Promise<void> {
    await super.start(existingStream);

    // Fix H6: Use the SAME stream that the parent is using for recording
    // The parent's stream is now protected, so we can access this.stream directly
    if (this.stream) {
      this.setupVAD(this.stream);
    }
  }

  private setupVAD(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    this.lastUpdateTime = performance.now();
    this.startVADMonitoring();
  }

  private startVADMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.analyser || !this.isActive()) return;

      const now = performance.now();
      const deltaTime = now - this.lastUpdateTime;
      this.lastUpdateTime = now;

      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average level
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / dataArray.length;
      const rawLevel = average / 255;

      // Smooth the level
      this.smoothedLevel = this.smoothedLevel * 0.8 + rawLevel * 0.2;

      // Check for silence
      if (this.smoothedLevel < this.silenceThreshold) {
        this.currentSilenceDuration += deltaTime;

        // Emit chunk on prolonged silence
        if (this.currentSilenceDuration >= this.silenceDurationForChunk) {
          const currentDuration = this.getCurrentDuration();
          if (currentDuration >= 1000) { // At least 1 second of audio
            this.forceEmit();
          }
          this.currentSilenceDuration = 0;
        }
      } else if (this.smoothedLevel >= this.speechThreshold) {
        this.currentSilenceDuration = 0;
      }

      this.vadAnimationFrame = requestAnimationFrame(update);
    };

    update();
  }

  async stop(): Promise<AudioChunk | null> {
    if (this.vadAnimationFrame) {
      cancelAnimationFrame(this.vadAnimationFrame);
      this.vadAnimationFrame = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;

    return super.stop();
  }
}
