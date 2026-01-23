import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Mode, LLMProvider, Settings } from '@/types';
import { MODE_CONFIG } from '@/types';
import { processStreamWithTimeout } from './stream-utils';

// Safe limit: 200MB for very long transcripts
const MAX_TRANSCRIPT_SIZE = 200 * 1024 * 1024;
// Target chunk size: 1MB for better balance between API calls and context
export const CHUNK_SIZE = 1024 * 1024;

interface EnrichOptions {
  transcript: string;
  mode: Mode;
  settings: Settings;
  onChunk?: (chunk: string) => void;
  onProgress?: (current: number, total: number) => void;
}

function getModel(settings: Settings) {
  const { selectedProvider, selectedModel, openaiApiKey, anthropicApiKey, ollamaBaseUrl } = settings;

  switch (selectedProvider) {
    case 'openai': {
      if (!openaiApiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey: openaiApiKey });
      // Use .chat() to force /v1/chat/completions instead of /v1/responses
      return openai.chat(selectedModel || 'gpt-4o');
    }
    case 'anthropic': {
      if (!anthropicApiKey) throw new Error('Anthropic API key is required');
      const anthropic = createAnthropic({ apiKey: anthropicApiKey });
      return anthropic(selectedModel || 'claude-sonnet-4-20250514');
    }
    case 'ollama': {
      const openai = createOpenAI({
        baseURL: `${ollamaBaseUrl}/v1`,
        apiKey: 'ollama', // Ollama doesn't require an API key
      });
      return openai(selectedModel || 'llama3.2');
    }
    default:
      throw new Error(`Unknown provider: ${selectedProvider}`);
  }
}

// Split transcript into chunks at sentence boundaries
export function splitTranscriptIntoChunks(transcript: string, maxChunkSize: number): string[] {
  const transcriptSize = new Blob([transcript]).size;

  // If small enough, return as single chunk
  if (transcriptSize <= maxChunkSize) {
    return [transcript];
  }

  const chunks: string[] = [];
  const sentences = transcript.split(/(?<=[.!?])\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
    const testSize = new Blob([testChunk]).size;

    if (testSize > maxChunkSize && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Process a single chunk
async function processChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  mode: Mode,
  settings: Settings,
  model: ReturnType<typeof getModel>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const config = MODE_CONFIG[mode];
  const customPrompt = settings.customPrompts?.[mode];

  // Use chunk-specific prompt for multi-chunk processing
  const chunkPrompt = totalChunks > 1
    ? `Du verarbeitest Teil ${chunkIndex + 1} von ${totalChunks} eines längeren Transkripts.

Extrahiere die wichtigsten Informationen aus diesem Teil:
- Hauptthemen und Diskussionspunkte
- Getroffene Entscheidungen (NUR explizite Beschlüsse, keine Vorschläge)
- Offene Fragen (NUR unbeantwortete Fragen)
- Action Items (mit Verantwortlichen, falls genannt)

Transkript-Teil:

${chunk}`
    : (customPrompt ? `${customPrompt}\n\n${chunk}` : `${config.prompt}\n\n${chunk}`);

  const { textStream } = streamText({
    model,
    prompt: chunkPrompt,
  });

  return processStreamWithTimeout(textStream, onChunk, 300000);
}

// Merge multiple chunk summaries into a final summary
async function mergeChunkSummaries(
  summaries: string[],
  mode: Mode,
  settings: Settings,
  model: ReturnType<typeof getModel>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const config = MODE_CONFIG[mode];
  const customPrompt = settings.customPrompts?.[mode];

  const combinedSummaries = summaries.map((s, i) => `--- Teil ${i + 1} ---\n${s}`).join('\n\n');

  const mergePrompt = customPrompt
    ? `${customPrompt}\n\nHier sind die Zusammenfassungen der einzelnen Teile des Transkripts. Erstelle daraus eine einheitliche Gesamtzusammenfassung:\n\n${combinedSummaries}`
    : `${config.prompt}\n\nHier sind die Zusammenfassungen der einzelnen Teile des Transkripts. Erstelle daraus eine einheitliche Gesamtzusammenfassung:\n\n${combinedSummaries}`;

  const { textStream } = streamText({
    model,
    prompt: mergePrompt,
  });

  return processStreamWithTimeout(textStream, onChunk, 300000);
}

export async function enrichTranscript({
  transcript,
  mode,
  settings,
  onChunk,
  onProgress,
}: EnrichOptions): Promise<string> {
  const model = getModel(settings);
  const transcriptSize = new Blob([transcript]).size;

  // Check if chunking is needed
  if (transcriptSize <= CHUNK_SIZE) {
    // Small transcript - process normally
    onProgress?.(1, 1);

    const customPrompt = settings.customPrompts?.[mode];
    const config = MODE_CONFIG[mode];
    const prompt = customPrompt
      ? `${customPrompt}\n\n${transcript}`
      : `${config.prompt}\n\n${transcript}`;

    const { textStream } = streamText({
      model,
      prompt,
    });

    return processStreamWithTimeout(textStream, onChunk, 300000);
  }

  // Large transcript - use chunking
  console.log(`Transcript size: ${(transcriptSize / 1024 / 1024).toFixed(2)} MB - using chunking`);

  const chunks = splitTranscriptIntoChunks(transcript, CHUNK_SIZE);
  const totalSteps = chunks.length + 1; // chunks + merge step

  console.log(`Split into ${chunks.length} chunks`);

  // Process each chunk
  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, totalSteps);
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    const summary = await processChunk(
      chunks[i],
      i,
      chunks.length,
      mode,
      settings,
      model,
      // Only pass onChunk for the last chunk to avoid flooding
      i === chunks.length - 1 ? undefined : undefined
    );
    chunkSummaries.push(summary);
  }

  // Merge all chunk summaries
  onProgress?.(totalSteps, totalSteps);
  console.log('Merging chunk summaries...');

  const finalSummary = await mergeChunkSummaries(
    chunkSummaries,
    mode,
    settings,
    model,
    onChunk
  );

  return finalSummary;
}

// Model options for each provider
export const MODEL_OPTIONS: Record<LLMProvider, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Budget)' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Best)' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Faster)' },
  ],
  ollama: [
    { value: 'llama3.2', label: 'Llama 3.2 (Recommended)' },
    { value: 'llama3.1', label: 'Llama 3.1' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'mixtral', label: 'Mixtral' },
    { value: 'codellama', label: 'Code Llama' },
  ],
};
