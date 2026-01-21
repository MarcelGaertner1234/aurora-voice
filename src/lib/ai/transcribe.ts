import { createWhisperFormData, audioBufferToWav } from '@/lib/audio/recorder';
import type { TranscriptionResult } from '@/types';

// Whisper API limit is 25MB, use 24MB as safe limit
const WHISPER_MAX_SIZE = 24 * 1024 * 1024;
const CHUNK_DURATION_MS = 60000; // 1 Minute pro Chunk

// Convert audio blob to WAV for Whisper API compatibility
// Safari/WebKit's MediaRecorder produces MP4 that Whisper may not parse correctly
// WebM/OGG is supported directly by Whisper - no conversion needed
async function convertAudioToWav(audioBlob: Blob): Promise<Blob> {
  // WebM/OGG is supported directly by Whisper API - skip conversion
  if (audioBlob.type.includes('webm') || audioBlob.type.includes('ogg')) {
    return audioBlob;
  }

  // WAV already in correct format - no conversion needed
  if (audioBlob.type.includes('wav')) {
    return audioBlob;
  }

  // Only MP4 (Safari) needs conversion to WAV
  const audioContext = new AudioContext();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  } finally {
    await audioContext.close();
  }
}

// Fix: Helper to validate transcription response
function validateTranscriptionResponse(result: unknown): { text: string; language?: string; duration?: number } {
  if (typeof result !== 'object' || result === null) {
    throw new Error('Invalid transcription response: expected object');
  }

  const obj = result as Record<string, unknown>;

  if (typeof obj.text !== 'string') {
    throw new Error('Invalid transcription response: missing or invalid text field');
  }

  return {
    text: obj.text,
    language: typeof obj.language === 'string' ? obj.language : undefined,
    duration: typeof obj.duration === 'number' ? obj.duration : undefined,
  };
}

// Helper function: Send already-converted audio directly to Whisper API
// Used to avoid double-conversion when audio is already in correct format
async function transcribeWavDirect(
  wavBlob: Blob,
  apiKey: string,
  language?: string
): Promise<TranscriptionResult> {
  const formData = createWhisperFormData(wavBlob, language);
  formData.append('response_format', 'verbose_json');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Transcription failed: ${response.statusText}`);
  }

  const result = await response.json();
  const validated = validateTranscriptionResponse(result);

  return {
    text: validated.text,
    language: validated.language || 'unknown',
    duration: validated.duration || 0,
  };
}

// Split audio into chunks for large files
async function splitAudioIntoChunks(
  audioBlob: Blob,
  chunkDurationMs: number
): Promise<Blob[]> {
  const audioContext = new AudioContext();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const chunks: Blob[] = [];
    const sampleRate = audioBuffer.sampleRate;
    const samplesPerChunk = Math.floor((chunkDurationMs / 1000) * sampleRate);
    const totalSamples = audioBuffer.length;

    for (let start = 0; start < totalSamples; start += samplesPerChunk) {
      const end = Math.min(start + samplesPerChunk, totalSamples);
      const chunkBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        end - start,
        sampleRate
      );

      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const sourceData = audioBuffer.getChannelData(channel);
        const chunkData = chunkBuffer.getChannelData(channel);
        for (let i = 0; i < end - start; i++) {
          chunkData[i] = sourceData[start + i];
        }
      }

      chunks.push(audioBufferToWav(chunkBuffer));
    }

    return chunks;
  } finally {
    await audioContext.close();
  }
}

export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string,
  language?: string
): Promise<TranscriptionResult> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required for transcription');
  }

  // Convert to WAV for maximum compatibility (Safari MP4 can cause parsing errors)
  const wavBlob = await convertAudioToWav(audioBlob);
  const formData = createWhisperFormData(wavBlob, language);
  formData.append('response_format', 'verbose_json');

  // Fix H1: Add 120s timeout for Whisper API (large audio files can take time)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error?.message || `Transcription failed: ${response.statusText}`
    );
  }

  const result = await response.json();

  // Fix: Validate response before using
  const validated = validateTranscriptionResponse(result);

  return {
    text: validated.text,
    language: validated.language || 'unknown',
    duration: validated.duration || 0,
  };
}

// Main transcription function with automatic chunking for large files
// FIX: Size check now happens AFTER conversion to ensure WAV size is checked
export async function transcribeAudioWithChunking(
  audioBlob: Blob,
  apiKey: string,
  language?: string,
  onProgress?: (current: number, total: number) => void
): Promise<TranscriptionResult> {
  // STEP 1: Convert to format supported by Whisper API (WAV for Safari MP4, pass-through for WebM/OGG)
  const convertedBlob = await convertAudioToWav(audioBlob);
  console.log(`Audio converted: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB → ${(convertedBlob.size / 1024 / 1024).toFixed(2)}MB`);

  // STEP 2: Check converted size (not original!) against Whisper limit
  if (convertedBlob.size <= WHISPER_MAX_SIZE) {
    onProgress?.(1, 1);
    return transcribeWavDirect(convertedBlob, apiKey, language);
  }

  // STEP 3: Converted audio too large - split into chunks
  console.log(`Audio size ${(convertedBlob.size / 1024 / 1024).toFixed(2)}MB exceeds ${(WHISPER_MAX_SIZE / 1024 / 1024).toFixed(0)}MB limit, splitting into chunks`);
  const chunks = await splitAudioIntoChunks(convertedBlob, CHUNK_DURATION_MS);
  const transcripts: string[] = [];
  let totalDuration = 0;
  let detectedLanguage = 'unknown';

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    // Chunks are already WAV from splitAudioIntoChunks, send directly
    const result = await transcribeWavDirect(chunks[i], apiKey, language);
    transcripts.push(result.text);
    totalDuration += result.duration;
    if (result.language && result.language !== 'unknown') {
      detectedLanguage = result.language;
    }
  }

  return {
    text: transcripts.join(' '),
    language: detectedLanguage,
    duration: totalDuration,
  };
}
