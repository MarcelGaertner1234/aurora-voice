// Document Search Module for Aurora Meeting Assistant
// Note: This module provides local document search capabilities
// For Tauri apps, this can be extended with native file system access

import { v4 as uuidv4 } from 'uuid';
import type { DocumentSearchResult, DocumentIndexEntry } from '@/types/research';

// Supported file types
export const SUPPORTED_FILE_TYPES = [
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'html',
  'xml',
  'yaml',
  'yml',
] as const;

export type SupportedFileType = (typeof SUPPORTED_FILE_TYPES)[number];

// Search options
export interface DocumentSearchOptions {
  maxResults?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  fuzzyMatch?: boolean;
  fileTypes?: SupportedFileType[];
  minRelevance?: number;
}

const DEFAULT_OPTIONS: Required<DocumentSearchOptions> = {
  maxResults: 10,
  caseSensitive: false,
  wholeWord: false,
  fuzzyMatch: true,
  fileTypes: [...SUPPORTED_FILE_TYPES],
  minRelevance: 0.1,
};

// In-memory document index for browser environment
export class DocumentIndex {
  private documents: Map<string, DocumentIndexEntry> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map(); // word -> document IDs

  // Add a document to the index
  addDocument(entry: DocumentIndexEntry): void {
    this.documents.set(entry.id, entry);
    this.indexContent(entry);
  }

  // Remove a document from the index
  removeDocument(id: string): void {
    const doc = this.documents.get(id);
    if (doc) {
      this.removeFromInvertedIndex(doc);
      this.documents.delete(id);
    }
  }

  // Update a document in the index
  updateDocument(entry: DocumentIndexEntry): void {
    this.removeDocument(entry.id);
    this.addDocument(entry);
  }

  // Get document by ID
  getDocument(id: string): DocumentIndexEntry | undefined {
    return this.documents.get(id);
  }

  // Get all documents
  getAllDocuments(): DocumentIndexEntry[] {
    return Array.from(this.documents.values());
  }

  // Search documents
  search(query: string, options: DocumentSearchOptions = {}): DocumentSearchResult[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const queryWords = this.tokenize(query, opts.caseSensitive);

    if (queryWords.length === 0) {
      return [];
    }

    // Find candidate documents
    const candidateDocIds = new Set<string>();
    for (const word of queryWords) {
      const matchingDocs = this.findMatchingDocuments(word, opts.fuzzyMatch, opts.caseSensitive);
      for (const docId of matchingDocs) {
        candidateDocIds.add(docId);
      }
    }

    // Score and filter results
    const results: DocumentSearchResult[] = [];

    for (const docId of candidateDocIds) {
      const doc = this.documents.get(docId);
      if (!doc) continue;

      // Check file type filter
      if (!opts.fileTypes.includes(doc.fileType as SupportedFileType)) {
        continue;
      }

      // Calculate relevance and find matched text
      const { score, matchedText, lineNumber } = this.scoreDocument(
        doc,
        queryWords,
        opts
      );

      if (score >= opts.minRelevance) {
        results.push({
          id: uuidv4(),
          filename: doc.filename,
          filepath: doc.filepath,
          content: doc.content,
          matchedText,
          lineNumber,
          relevanceScore: score,
          fileType: doc.fileType,
          lastModified: doc.lastModified,
        });
      }
    }

    // Sort by relevance and limit results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, opts.maxResults);
  }

  // Get index statistics
  getStats(): {
    documentCount: number;
    wordCount: number;
    totalSize: number;
  } {
    let totalSize = 0;
    for (const doc of this.documents.values()) {
      totalSize += doc.size;
    }

    return {
      documentCount: this.documents.size,
      wordCount: this.invertedIndex.size,
      totalSize,
    };
  }

  // Clear the index
  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
  }

  // Private methods

  private indexContent(entry: DocumentIndexEntry): void {
    const words = this.tokenize(entry.content, false);
    const titleWords = this.tokenize(entry.filename, false);
    const keywordSet = new Set([...words, ...titleWords, ...entry.keywords]);

    for (const word of keywordSet) {
      if (!this.invertedIndex.has(word)) {
        this.invertedIndex.set(word, new Set());
      }
      this.invertedIndex.get(word)!.add(entry.id);
    }
  }

  private removeFromInvertedIndex(entry: DocumentIndexEntry): void {
    const words = this.tokenize(entry.content, false);
    for (const word of words) {
      const docSet = this.invertedIndex.get(word);
      if (docSet) {
        docSet.delete(entry.id);
        if (docSet.size === 0) {
          this.invertedIndex.delete(word);
        }
      }
    }
  }

  private tokenize(text: string, caseSensitive: boolean): string[] {
    const normalized = caseSensitive ? text : text.toLowerCase();
    // Split on non-word characters and filter short words
    return normalized
      .split(/[^\p{L}\p{N}]+/u)
      .filter(word => word.length >= 2);
  }

  private findMatchingDocuments(
    word: string,
    fuzzy: boolean,
    caseSensitive: boolean
  ): Set<string> {
    const normalizedWord = caseSensitive ? word : word.toLowerCase();
    const matches = new Set<string>();

    if (this.invertedIndex.has(normalizedWord)) {
      for (const docId of this.invertedIndex.get(normalizedWord)!) {
        matches.add(docId);
      }
    }

    // Fuzzy matching: find words that start with or contain the query word
    if (fuzzy) {
      for (const [indexedWord, docIds] of this.invertedIndex) {
        if (indexedWord.includes(normalizedWord) || normalizedWord.includes(indexedWord)) {
          for (const docId of docIds) {
            matches.add(docId);
          }
        }
      }
    }

    return matches;
  }

  private scoreDocument(
    doc: DocumentIndexEntry,
    queryWords: string[],
    opts: Required<DocumentSearchOptions>
  ): { score: number; matchedText: string; lineNumber?: number } {
    const content = opts.caseSensitive ? doc.content : doc.content.toLowerCase();
    const filename = opts.caseSensitive ? doc.filename : doc.filename.toLowerCase();
    const lines = doc.content.split('\n');

    let score = 0;
    let bestMatchLine = 0;
    let bestMatchScore = 0;
    let matchedText = '';

    // Score based on filename matches (weighted higher)
    for (const word of queryWords) {
      if (filename.includes(word)) {
        score += 0.3;
      }
    }

    // Score based on keyword matches
    for (const word of queryWords) {
      const normalizedWord = opts.caseSensitive ? word : word.toLowerCase();
      if (doc.keywords.some(k => k.toLowerCase().includes(normalizedWord))) {
        score += 0.2;
      }
    }

    // Find best matching line and calculate content score
    for (let i = 0; i < lines.length; i++) {
      const line = opts.caseSensitive ? lines[i] : lines[i].toLowerCase();
      let lineScore = 0;

      for (const word of queryWords) {
        if (opts.wholeWord) {
          const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, opts.caseSensitive ? '' : 'i');
          if (regex.test(line)) {
            lineScore += 0.2;
          }
        } else if (line.includes(word)) {
          lineScore += 0.15;
        }
      }

      if (lineScore > bestMatchScore) {
        bestMatchScore = lineScore;
        bestMatchLine = i;
        matchedText = lines[i].trim();
      }
    }

    score += bestMatchScore;

    // Normalize score
    score = Math.min(1, score);

    return {
      score,
      matchedText: matchedText || doc.content.slice(0, 200),
      lineNumber: bestMatchLine + 1,
    };
  }
}

// Document search manager
export class DocumentSearchManager {
  private index: DocumentIndex;

  constructor() {
    this.index = new DocumentIndex();
  }

  // Index a document from text content
  indexDocument(
    filename: string,
    filepath: string,
    content: string,
    fileType: string = 'txt'
  ): DocumentIndexEntry {
    const entry: DocumentIndexEntry = {
      id: uuidv4(),
      filename,
      filepath,
      content,
      fileType,
      size: new Blob([content]).size,
      lastModified: new Date(),
      indexedAt: new Date(),
      keywords: extractKeywords(content),
    };

    this.index.addDocument(entry);
    return entry;
  }

  // Index multiple documents
  indexDocuments(
    documents: Array<{
      filename: string;
      filepath: string;
      content: string;
      fileType?: string;
    }>
  ): DocumentIndexEntry[] {
    return documents.map(doc =>
      this.indexDocument(doc.filename, doc.filepath, doc.content, doc.fileType)
    );
  }

  // Remove a document from index
  removeDocument(id: string): void {
    this.index.removeDocument(id);
  }

  // Search indexed documents
  search(query: string, options?: DocumentSearchOptions): DocumentSearchResult[] {
    return this.index.search(query, options);
  }

  // Get all indexed documents
  getIndexedDocuments(): DocumentIndexEntry[] {
    return this.index.getAllDocuments();
  }

  // Get index statistics
  getStats() {
    return this.index.getStats();
  }

  // Clear index
  clearIndex(): void {
    this.index.clear();
  }

  // Export index to JSON
  exportIndex(): string {
    const documents = this.index.getAllDocuments();
    return JSON.stringify(documents, null, 2);
  }

  // Import index from JSON
  importIndex(json: string): void {
    try {
      const documents: DocumentIndexEntry[] = JSON.parse(json);
      for (const doc of documents) {
        // Convert date strings back to Date objects
        doc.lastModified = new Date(doc.lastModified);
        doc.indexedAt = new Date(doc.indexedAt);
        this.index.addDocument(doc);
      }
    } catch (error) {
      throw new Error(`Failed to import index: ${error}`);
    }
  }
}

// Utility functions

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractKeywords(content: string): string[] {
  // Simple keyword extraction: find most frequent meaningful words
  const words = content
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word.length >= 4);

  const wordFreq = new Map<string, number>();
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  // Get top 10 keywords by frequency
  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

// Create singleton instance
export const documentSearchManager = new DocumentSearchManager();
