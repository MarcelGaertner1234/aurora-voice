import { createWhisperFormData, audioBufferToWav } from '@/lib/audio/recorder';
import type { TranscriptionResult } from '@/types';

// Whisper API limit is 25MB, use 24MB as safe limit
const WHISPER_MAX_SIZE = 24 * 1024 * 1024;
const CHUNK_DURATION_MS = 60000; // 1 Minute pro Chunk
const CHUNK_TIMEOUT_MS = 180000; // 180 Sekunden Timeout (erhöht für lange Aufnahmen)
const PARALLEL_CHUNKS = 3; // Parallele Chunk-Verarbeitung
const MAX_RETRIES = 3; // Default retries for most errors
const MAX_RETRIES_RATE_LIMIT = 5; // More retries for rate limiting (429)

// HTTP status codes that are worth retrying
const RETRIABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Custom error class that includes HTTP status code for smart retry logic
 */
class TranscriptionError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'TranscriptionError';
  }

  get isRetriable(): boolean {
    return this.statusCode !== undefined && RETRIABLE_STATUS_CODES.includes(this.statusCode);
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }
}

// Convert audio blob to WAV for Whisper API compatibility
// Safari/WebKit's MediaRecorder produces MP4 that Whisper may not parse correctly
// WebM/OGG is supported directly by Whisper - no conversion needed
export async function convertAudioToWav(audioBlob: Blob): Promise<Blob> {
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
  const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

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
    const message = error.error?.message || `Transcription failed: ${response.statusText}`;
    throw new TranscriptionError(message, response.status);
  }

  const result = await response.json();
  const validated = validateTranscriptionResponse(result);

  return {
    text: validated.text,
    language: validated.language || 'unknown',
    duration: validated.duration || 0,
  };
}

// Retry wrapper with exponential backoff and HTTP status-aware logic
async function transcribeWithRetry(
  chunk: Blob,
  apiKey: string,
  language?: string
): Promise<TranscriptionResult> {
  let lastError: Error | null = null;
  let maxRetries = MAX_RETRIES;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transcribeWavDirect(chunk, apiKey, language);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if this is a TranscriptionError with HTTP status info
      if (lastError instanceof TranscriptionError) {
        // Non-retriable errors (400, 401, 403, 404, etc.) - fail immediately
        if (!lastError.isRetriable) {
          console.error(`Non-retriable error (HTTP ${lastError.statusCode}):`, lastError.message);
          throw lastError;
        }

        // Rate limit (429) - use more retries
        if (lastError.isRateLimited) {
          maxRetries = MAX_RETRIES_RATE_LIMIT;
          console.warn(`Rate limited (429). Using extended retries (${maxRetries} total).`);
        }
      }

      console.warn(`Transcription attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) break;

      // Exponential backoff with jitter: (1s + random), (2s + random), (4s + random)
      // Jitter prevents "thundering herd" when multiple requests retry simultaneously
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000; // 0-1000ms random jitter
      const delay = baseDelay + jitter;
      console.log(`Retrying in ${Math.round(delay)}ms (base: ${baseDelay}ms, jitter: ${Math.round(jitter)}ms)...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
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

  // 180s timeout for Whisper API (large audio files can take time)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

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
  console.log(`Split into ${chunks.length} chunks, processing ${PARALLEL_CHUNKS} in parallel`);

  // Pre-allocate results array to maintain order
  const results: TranscriptionResult[] = new Array(chunks.length);
  let completedChunks = 0;

  // Process chunks in parallel batches
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const batchStart = i;
    const batch = chunks.slice(i, i + PARALLEL_CHUNKS);

    // Process batch in parallel with retry logic
    const batchResults = await Promise.all(
      batch.map(async (chunk, j) => {
        const result = await transcribeWithRetry(chunk, apiKey, language);
        completedChunks++;
        onProgress?.(completedChunks, chunks.length);
        return { index: batchStart + j, result };
      })
    );

    // Store results in correct order
    batchResults.forEach(({ index, result }) => {
      results[index] = result;
    });
  }

  // Combine results maintaining original order
  let totalDuration = 0;
  let detectedLanguage = 'unknown';
  const transcripts = results.map(result => {
    totalDuration += result.duration;
    if (result.language && result.language !== 'unknown') {
      detectedLanguage = result.language;
    }
    return result.text;
  });

  return {
    text: transcripts.join(' '),
    language: detectedLanguage,
    duration: totalDuration,
  };
}
