// Semantic Search Engine for Aurora Voice
// Cross-meeting intelligence using embeddings

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/utils/logger';
import type { Meeting } from '@/types/meeting';
import { generateEmbedding, chunkText, type EmbeddingProvider } from './embeddings';
import {
  storeVectors,
  searchVectors,
  deleteVectorsByMeetingId,
  isMeetingIndexed,
  getVectorCount,
  type StoredVector,
  type SearchResult,
} from './vector-store';

export interface IndexingConfig {
  provider: EmbeddingProvider;
  apiKey?: string;
  baseUrl?: string;
}

export interface SearchConfig extends IndexingConfig {
  topK?: number;
  minSimilarity?: number;
  types?: StoredVector['type'][];
}

export interface EnrichedSearchResult extends SearchResult {
  meetingTitle: string;
  meetingDate: Date;
}

/**
 * Index a meeting for semantic search
 */
export async function indexMeeting(
  meeting: Meeting,
  config: IndexingConfig
): Promise<{ vectorsCreated: number; error?: string }> {
  try {
    // Check if already indexed
    const alreadyIndexed = await isMeetingIndexed(meeting.id);
    if (alreadyIndexed) {
      // Re-index: delete old vectors first
      await deleteVectorsByMeetingId(meeting.id);
    }

    const vectors: StoredVector[] = [];
    const now = new Date().toISOString();

    // Index decisions
    if (meeting.summary?.decisions) {
      for (const decision of meeting.summary.decisions) {
        try {
          const result = await generateEmbedding(decision.text, config);
          vectors.push({
            id: uuidv4(),
            meetingId: meeting.id,
            type: 'decision',
            text: decision.text,
            embedding: result.embedding,
            metadata: {
              timestamp: decision.timestamp,
              confidence: 1,
            },
            createdAt: now,
          });
        } catch (err) {
          logger.warn('Failed to embed decision:', err);
        }
      }
    }

    // Index open questions
    if (meeting.summary?.openQuestions) {
      for (const question of meeting.summary.openQuestions) {
        try {
          const result = await generateEmbedding(question.text, config);
          vectors.push({
            id: uuidv4(),
            meetingId: meeting.id,
            type: 'question',
            text: question.text,
            embedding: result.embedding,
            metadata: {
              timestamp: question.timestamp,
              speakerId: question.askedBy,
            },
            createdAt: now,
          });
        } catch (err) {
          logger.warn('Failed to embed question:', err);
        }
      }
    }

    // Index key points
    if (meeting.summary?.keyPoints) {
      for (const keyPoint of meeting.summary.keyPoints) {
        try {
          const result = await generateEmbedding(keyPoint, config);
          vectors.push({
            id: uuidv4(),
            meetingId: meeting.id,
            type: 'keypoint',
            text: keyPoint,
            embedding: result.embedding,
            metadata: {},
            createdAt: now,
          });
        } catch (err) {
          logger.warn('Failed to embed keypoint:', err);
        }
      }
    }

    // Index summary overview in chunks
    if (meeting.summary?.overview) {
      const chunks = chunkText(meeting.summary.overview);
      for (const chunk of chunks) {
        try {
          const result = await generateEmbedding(chunk, config);
          vectors.push({
            id: uuidv4(),
            meetingId: meeting.id,
            type: 'summary_chunk',
            text: chunk,
            embedding: result.embedding,
            metadata: {},
            createdAt: now,
          });
        } catch (err) {
          logger.warn('Failed to embed summary chunk:', err);
        }
      }
    }

    // Store all vectors
    if (vectors.length > 0) {
      await storeVectors(vectors);
    }

    logger.info(`Meeting ${meeting.id} indexed: ${vectors.length} vectors`);
    return { vectorsCreated: vectors.length };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Meeting indexing failed:', err);
    return { vectorsCreated: 0, error: errorMsg };
  }
}

/**
 * Index multiple meetings
 */
export async function indexMeetings(
  meetings: Meeting[],
  config: IndexingConfig,
  onProgress?: (current: number, total: number) => void
): Promise<{ totalVectors: number; errors: string[] }> {
  let totalVectors = 0;
  const errors: string[] = [];

  for (let i = 0; i < meetings.length; i++) {
    const meeting = meetings[i];

    // Skip meetings without summaries
    if (!meeting.summary) {
      continue;
    }

    onProgress?.(i + 1, meetings.length);

    const result = await indexMeeting(meeting, config);
    totalVectors += result.vectorsCreated;
    if (result.error) {
      errors.push(`${meeting.title}: ${result.error}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { totalVectors, errors };
}

/**
 * Perform semantic search across all meetings
 */
export async function semanticSearch(
  query: string,
  config: SearchConfig,
  meetingMap?: Map<string, Meeting>
): Promise<EnrichedSearchResult[]> {
  try {
    // Generate query embedding
    const queryResult = await generateEmbedding(query, config);

    // Search vector store
    const results = await searchVectors(queryResult.embedding, {
      topK: config.topK || 10,
      minSimilarity: config.minSimilarity || 0.3,
      types: config.types,
    });

    // Enrich results with meeting info
    const enrichedResults: EnrichedSearchResult[] = results.map(result => {
      const meeting = meetingMap?.get(result.meetingId);
      return {
        ...result,
        meetingTitle: meeting?.title || 'Unbekanntes Meeting',
        meetingDate: meeting?.createdAt || new Date(),
      };
    });

    logger.debug(`Semantic search: "${query}" → ${enrichedResults.length} results`);
    return enrichedResults;
  } catch (err) {
    logger.error('Semantic search failed:', err);
    throw err;
  }
}

/**
 * Get suggested search queries based on recent meeting content
 */
export function getSuggestedQueries(meetings: Meeting[]): string[] {
  const suggestions: string[] = [];

  // Extract from recent decisions
  meetings.slice(0, 5).forEach(m => {
    m.summary?.decisions?.slice(0, 2).forEach(d => {
      // Extract key terms
      const keywords = d.text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g);
      if (keywords && keywords.length > 0) {
        suggestions.push(`Was wurde zu ${keywords[0]} entschieden?`);
      }
    });
  });

  // Common search patterns
  suggestions.push(
    'Budget Entscheidungen',
    'Offene Fragen',
    'Nächste Schritte',
    'Timeline',
    'Deadlines'
  );

  // Deduplicate and limit
  return [...new Set(suggestions)].slice(0, 8);
}

/**
 * Get search statistics
 */
export async function getSearchStats(): Promise<{
  indexedVectors: number;
  isReady: boolean;
}> {
  try {
    const count = await getVectorCount();
    return {
      indexedVectors: count,
      isReady: count > 0,
    };
  } catch {
    return {
      indexedVectors: 0,
      isReady: false,
    };
  }
}

/**
 * Format search result type for display
 */
export function formatResultType(type: StoredVector['type']): string {
  const typeLabels: Record<StoredVector['type'], string> = {
    decision: 'Entscheidung',
    question: 'Offene Frage',
    task: 'Aufgabe',
    keypoint: 'Key Point',
    summary_chunk: 'Zusammenfassung',
  };
  return typeLabels[type] || type;
}

/**
 * Get color for result type
 */
export function getResultTypeColor(type: StoredVector['type']): string {
  const typeColors: Record<StoredVector['type'], string> = {
    decision: 'text-green-400 bg-green-500/20',
    question: 'text-amber-400 bg-amber-500/20',
    task: 'text-blue-400 bg-blue-500/20',
    keypoint: 'text-purple-400 bg-purple-500/20',
    summary_chunk: 'text-cyan-400 bg-cyan-500/20',
  };
  return typeColors[type] || 'text-gray-400 bg-gray-500/20';
}
