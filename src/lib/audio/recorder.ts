export interface AudioRecorderOptions {
  onAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
}

// Helper: Write string to DataView
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Helper: Convert AudioBuffer to WAV Blob
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave audio data
  const offset = 44;
  const channelData = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let index = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset + index, intSample, true);
      index += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Convert WebM blob to WAV for Safari playback
export async function convertToPlayableFormat(webmBlob: Blob): Promise<RecordingResult> {
  // Check if we need conversion (Safari can't play WebM)
  const audio = document.createElement('audio');
  const canPlayWebM = audio.canPlayType(webmBlob.type) !== '';

  if (canPlayWebM) {
    // Browser can play WebM, no conversion needed
    return { blob: webmBlob, mimeType: webmBlob.type };
  }

  console.log('Converting WebM to WAV for Safari playback...');

  // Decode WebM using AudioContext - use try-finally to ensure cleanup
  const audioContext = new AudioContext();
  try {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to WAV
    const wavBlob = audioBufferToWav(audioBuffer);

    console.log('Conversion complete:', {
      originalSize: webmBlob.size,
      convertedSize: wavBlob.size,
    });

    return { blob: wavBlob, mimeType: 'audio/wav' };
  } finally {
    // Always close AudioContext to prevent resource leak
    await audioContext.close();
  }
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private animationFrame: number | null = null;
  private onAudioLevel?: (level: number) => void;
  private onError?: (error: Error) => void;

  constructor(options: AudioRecorderOptions = {}) {
    this.onAudioLevel = options.onAudioLevel;
    this.onError = options.onError;
  }

  async start(): Promise<void> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up audio context for level analysis
      this.audioContext = new AudioContext();

      // Resume AudioContext if suspended (required by many browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      // Start level monitoring
      this.startLevelMonitoring();

      // Set up media recorder
      const mimeType = this.getSupportedMimeType();
      console.log('Starting recording with format:', mimeType);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      this.chunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        this.onError?.(new Error('Recording error'));
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start recording');
      this.onError?.(err);
      throw err;
    }
  }

  async stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const originalMimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const originalBlob = new Blob(this.chunks, { type: originalMimeType });

        try {
          // Convert for Safari playback if needed
          const converted = await convertToPlayableFormat(originalBlob);
          this.cleanup();
          resolve(converted);
        } catch (err) {
          console.error('Conversion failed, using original:', err);
          this.cleanup();
          resolve({ blob: originalBlob, mimeType: originalMimeType });
        }
      };

      this.mediaRecorder.stop();
    });
  }

  private startLevelMonitoring(): void {
    if (!this.analyser) return;

    // Time domain statt frequency - besser für Sprache
    const dataArray = new Uint8Array(this.analyser.fftSize);

    const updateLevel = () => {
      if (!this.analyser) return;

      // Time domain data: Werte um 128 = Stille, Abweichung = Amplitude
      this.analyser.getByteTimeDomainData(dataArray);

      // Peak-Detektion: Maximale Abweichung von 128 finden
      let maxDeviation = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const deviation = Math.abs(dataArray[i] - 128);
        if (deviation > maxDeviation) {
          maxDeviation = deviation;
        }
      }

      // Normalisieren auf 0-1 (max deviation ist 128)
      const rawLevel = maxDeviation / 128;

      // Verstärkung: Werte mit Faktor 3 multiplizieren und auf 1 begrenzen
      const normalizedLevel = Math.min(rawLevel * 3, 1);

      this.onAudioLevel?.(normalizedLevel);

      this.animationFrame = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  private cleanup(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.onAudioLevel?.(0);
  }

  private getSupportedMimeType(): string {
    // Priority order optimized for cross-platform playback compatibility
    // MP4/AAC works on all platforms (Safari, Chrome, Firefox, WebKit)
    // WebM/Opus works for recording on Safari but NOT for playback!
    const types = [
      'audio/mp4',              // Best compatibility (Safari + all browsers)
      'audio/aac',              // Safari fallback
      'audio/webm;codecs=opus', // Chrome/Firefox (NOT Safari playback!)
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Selected recording format:', type);
        return type;
      }
    }

    // Log available formats for debugging
    console.warn('No preferred format supported, using default');
    return 'audio/webm';
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

// Convert audio blob to format suitable for Whisper API
export async function convertToWav(blob: Blob): Promise<Blob> {
  // For Whisper API, we can send webm directly since it supports multiple formats
  // But if we need WAV conversion, we'd use the Web Audio API
  return blob;
}

// Create FormData for Whisper API
export function createWhisperFormData(
  audioBlob: Blob,
  language?: string
): FormData {
  const formData = new FormData();

  // Determine file extension from mime type
  const mimeType = audioBlob.type;
  const extension = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('webm')
      ? 'webm'
      : mimeType.includes('mp4')
        ? 'm4a'
        : mimeType.includes('ogg')
          ? 'ogg'
          : 'webm';

  formData.append('file', audioBlob, `recording.${extension}`);
  formData.append('model', 'whisper-1');

  if (language && language !== 'auto') {
    formData.append('language', language);
  }

  return formData;
}
