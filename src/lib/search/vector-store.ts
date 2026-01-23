// Vector Store for Aurora Voice
// IndexedDB-based vector storage for semantic search

import Dexie, { type Table } from 'dexie';
import { logger } from '@/lib/utils/logger';
import { cosineSimilarity } from './embeddings';

// Types for stored vectors
export interface StoredVector {
  id: string;
  meetingId: string;
  type: 'decision' | 'question' | 'task' | 'keypoint' | 'summary_chunk';
  text: string;
  embedding: number[];
  metadata: {
    timestamp?: number;
    speakerId?: string;
    confidence?: number;
  };
  createdAt: string;
}

export interface SearchResult {
  id: string;
  meetingId: string;
  meetingTitle?: string;
  meetingDate?: Date;
  type: StoredVector['type'];
  text: string;
  similarity: number;
  metadata: StoredVector['metadata'];
}

// Vector Database
class VectorDatabase extends Dexie {
  vectors!: Table<StoredVector, string>;

  constructor() {
    super('AuroraVectorStore');

    this.version(1).stores({
      vectors: 'id, meetingId, type, createdAt',
    });
  }
}

// Singleton with lazy initialization
let _vectorDb: VectorDatabase | null = null;
let _vectorDbReady: Promise<void> | null = null;

function getVectorDb(): VectorDatabase {
  if (typeof window === 'undefined') {
    throw new Error('Vector store is only available in browser');
  }
  if (!_vectorDb) {
    _vectorDb = new VectorDatabase();
  }
  return _vectorDb;
}

async function initVectorDb(): Promise<void> {
  const db = getVectorDb();
  await db.open();
  logger.debug('Vector store initialized');
}

function getVectorDbReady(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (!_vectorDbReady) {
    _vectorDbReady = initVectorDb();
  }
  return _vectorDbReady;
}

// Public API

/**
 * Store a vector in the database
 */
export async function storeVector(vector: StoredVector): Promise<void> {
  await getVectorDbReady();
  const db = getVectorDb();
  await db.vectors.put(vector);
  logger.debug('Vector stored:', vector.id);
}

/**
 * Store multiple vectors in batch
 */
export async function storeVectors(vectors: StoredVector[]): Promise<void> {
  await getVectorDbReady();
  const db = getVectorDb();
  await db.vectors.bulkPut(vectors);
  logger.debug('Vectors stored:', vectors.length);
}

/**
 * Get all vectors for a meeting
 */
export async function getVectorsByMeetingId(meetingId: string): Promise<StoredVector[]> {
  await getVectorDbReady();
  const db = getVectorDb();
  return db.vectors.where('meetingId').equals(meetingId).toArray();
}

/**
 * Delete all vectors for a meeting
 */
export async function deleteVectorsByMeetingId(meetingId: string): Promise<void> {
  await getVectorDbReady();
  const db = getVectorDb();
  await db.vectors.where('meetingId').equals(meetingId).delete();
  logger.debug('Vectors deleted for meeting:', meetingId);
}

/**
 * Get all vectors in the database
 */
export async function getAllVectors(): Promise<StoredVector[]> {
  await getVectorDbReady();
  const db = getVectorDb();
  return db.vectors.toArray();
}

/**
 * Get vector count
 */
export async function getVectorCount(): Promise<number> {
  await getVectorDbReady();
  const db = getVectorDb();
  return db.vectors.count();
}

/**
 * Search vectors by similarity to query embedding
 */
export async function searchVectors(
  queryEmbedding: number[],
  options: {
    topK?: number;
    minSimilarity?: number;
    types?: StoredVector['type'][];
    meetingIds?: string[];
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 10,
    minSimilarity = 0.3,
    types,
    meetingIds,
  } = options;

  await getVectorDbReady();
  const db = getVectorDb();

  // Get all vectors (could optimize with spatial index in future)
  let vectors = await db.vectors.toArray();

  // Apply filters
  if (types && types.length > 0) {
    vectors = vectors.filter(v => types.includes(v.type));
  }
  if (meetingIds && meetingIds.length > 0) {
    vectors = vectors.filter(v => meetingIds.includes(v.meetingId));
  }

  // Calculate similarities
  const scored = vectors.map(vector => ({
    ...vector,
    similarity: cosineSimilarity(queryEmbedding, vector.embedding),
  }));

  // Filter by minimum similarity and sort
  const filtered = scored
    .filter(v => v.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  // Map to search results
  return filtered.map(v => ({
    id: v.id,
    meetingId: v.meetingId,
    type: v.type,
    text: v.text,
    similarity: v.similarity,
    metadata: v.metadata,
  }));
}

/**
 * Clear all vectors (for testing/reset)
 */
export async function clearVectorStore(): Promise<void> {
  await getVectorDbReady();
  const db = getVectorDb();
  await db.vectors.clear();
  logger.info('Vector store cleared');
}

/**
 * Get statistics about the vector store
 */
export async function getVectorStats(): Promise<{
  totalVectors: number;
  byType: Record<string, number>;
  byMeeting: Record<string, number>;
}> {
  await getVectorDbReady();
  const db = getVectorDb();

  const vectors = await db.vectors.toArray();

  const byType: Record<string, number> = {};
  const byMeeting: Record<string, number> = {};

  vectors.forEach(v => {
    byType[v.type] = (byType[v.type] || 0) + 1;
    byMeeting[v.meetingId] = (byMeeting[v.meetingId] || 0) + 1;
  });

  return {
    totalVectors: vectors.length,
    byType,
    byMeeting,
  };
}

/**
 * Check if a meeting has been indexed
 */
export async function isMeetingIndexed(meetingId: string): Promise<boolean> {
  await getVectorDbReady();
  const db = getVectorDb();
  const count = await db.vectors.where('meetingId').equals(meetingId).count();
  return count > 0;
}
