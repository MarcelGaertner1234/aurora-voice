// Embeddings API for Aurora Voice
// Supports OpenAI and Ollama for generating text embeddings

import { logger } from '@/lib/utils/logger';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount: number;
}

export type EmbeddingProvider = 'openai' | 'ollama';

interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// OpenAI embedding models
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, cost-effective

// Ollama embedding models
const OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text'; // 768 dimensions, runs locally

/**
 * Generate embedding for a single text using OpenAI
 */
async function generateOpenAIEmbedding(
  text: string,
  apiKey: string
): Promise<EmbeddingResult> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${error}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding;

  return {
    embedding,
    model: OPENAI_EMBEDDING_MODEL,
    tokenCount: data.usage?.total_tokens || 0,
  };
}

/**
 * Generate embedding for a single text using Ollama
 */
async function generateOllamaEmbedding(
  text: string,
  baseUrl: string
): Promise<EmbeddingResult> {
  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama embedding failed: ${error}`);
  }

  const data = await response.json();
  const embedding = data.embedding;

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Ollama did not return valid embedding');
  }

  return {
    embedding,
    model: OLLAMA_EMBEDDING_MODEL,
    tokenCount: Math.ceil(text.length / 4), // Approximate
  };
}

/**
 * Generate embedding for text using configured provider
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<EmbeddingResult> {
  // Clean and truncate text (max ~8000 tokens ≈ 32000 chars for safety)
  const cleanedText = text.trim().substring(0, 32000);

  if (!cleanedText) {
    throw new Error('Cannot generate embedding for empty text');
  }

  try {
    if (config.provider === 'openai') {
      if (!config.apiKey) {
        throw new Error('OpenAI API key required for embeddings');
      }
      return await generateOpenAIEmbedding(cleanedText, config.apiKey);
    } else if (config.provider === 'ollama') {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      return await generateOllamaEmbedding(cleanedText, baseUrl);
    } else {
      throw new Error(`Unknown embedding provider: ${config.provider}`);
    }
  } catch (err) {
    logger.error('Embedding generation failed:', err);
    throw err;
  }
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig
): Promise<EmbeddingResult[]> {
  // Process in parallel with rate limiting
  const batchSize = config.provider === 'openai' ? 10 : 3; // Ollama is slower
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(text => generateEmbedding(text, config))
    );
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Find most similar embeddings from a set
 */
export function findMostSimilar(
  queryEmbedding: number[],
  candidates: { id: string; embedding: number[] }[],
  topK: number = 5
): { id: string; similarity: number }[] {
  const scored = candidates.map(candidate => ({
    id: candidate.id,
    similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
  }));

  // Sort by similarity descending
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK);
}

/**
 * Chunk text for embedding (500 tokens ≈ 2000 chars)
 */
export function chunkText(
  text: string,
  maxChunkSize: number = 2000,
  overlap: number = 200
): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + maxChunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.substring(start, end).trim());
    start = end - overlap;

    // Prevent infinite loop
    if (start >= text.length - overlap) break;
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Check if embedding provider is available
 */
export async function checkEmbeddingAvailability(
  config: EmbeddingConfig
): Promise<{ available: boolean; error?: string }> {
  try {
    if (config.provider === 'openai') {
      if (!config.apiKey) {
        return { available: false, error: 'OpenAI API key nicht konfiguriert' };
      }
      // Quick test with minimal text
      await generateOpenAIEmbedding('test', config.apiKey);
      return { available: true };
    } else if (config.provider === 'ollama') {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      // Check if Ollama is running and has the embedding model
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) {
        return { available: false, error: 'Ollama nicht erreichbar' };
      }
      const data = await response.json();
      const hasEmbeddingModel = data.models?.some(
        (m: { name: string }) => m.name.includes('nomic-embed')
      );
      if (!hasEmbeddingModel) {
        return {
          available: false,
          error: `Embedding-Modell nicht installiert. Führen Sie aus: ollama pull ${OLLAMA_EMBEDDING_MODEL}`,
        };
      }
      return { available: true };
    }
    return { available: false, error: 'Unbekannter Provider' };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler',
    };
  }
}
