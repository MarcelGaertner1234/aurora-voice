// Research Types for Aurora Meeting Assistant

// Search result from web search
export interface WebSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: Date;
  relevanceScore?: number;
}

// Local document search result
export interface DocumentSearchResult {
  id: string;
  filename: string;
  filepath: string;
  content: string;
  matchedText: string;
  lineNumber?: number;
  relevanceScore: number;
  fileType: string;
  lastModified: Date;
}

// Fact check result
export interface FactCheckResult {
  id: string;
  claim: string;
  verdict: 'true' | 'false' | 'partially_true' | 'unverified' | 'disputed';
  confidence: number;
  explanation: string;
  sources: WebSearchResult[];
  checkedAt: Date;
}

// Research query
export interface ResearchQuery {
  id: string;
  query: string;
  type: 'web' | 'document' | 'fact_check' | 'all';
  context?: string;
  createdAt: Date;
  meetingId?: string;
}

// Combined research result
export interface ResearchResult {
  id: string;
  queryId: string;
  query: string;
  webResults: WebSearchResult[];
  documentResults: DocumentSearchResult[];
  factCheck?: FactCheckResult;
  summary?: string;
  createdAt: Date;
  processingTime: number;
  cached: boolean;
}

// Research session for a meeting
export interface ResearchSession {
  id: string;
  meetingId: string;
  queries: ResearchQuery[];
  results: Map<string, ResearchResult>;
  startedAt: Date;
  lastActivityAt: Date;
}

// Research suggestion (auto-generated from transcript)
export interface ResearchSuggestion {
  id: string;
  query: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  triggerText: string;
  timestamp: number;
  dismissed: boolean;
}

// Search provider configuration
export interface SearchProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  rateLimit?: number;
  priority: number;
}

// Document index entry
export interface DocumentIndexEntry {
  id: string;
  filename: string;
  filepath: string;
  content: string;
  fileType: string;
  size: number;
  lastModified: Date;
  indexedAt: Date;
  keywords: string[];
}

// Research cache entry
export interface ResearchCacheEntry {
  query: string;
  queryHash: string;
  result: ResearchResult;
  cachedAt: Date;
  expiresAt: Date;
  hitCount: number;
}

// Research statistics
export interface ResearchStats {
  totalQueries: number;
  webSearches: number;
  documentSearches: number;
  factChecks: number;
  cacheHits: number;
  averageProcessingTime: number;
  topQueries: { query: string; count: number }[];
}

// Research event for real-time updates
export type ResearchEventType =
  | 'query_started'
  | 'web_results'
  | 'document_results'
  | 'fact_check_complete'
  | 'summary_ready'
  | 'query_complete'
  | 'error'
  | 'suggestion';

export interface ResearchEvent {
  type: ResearchEventType;
  queryId: string;
  data: unknown;
  timestamp: Date;
}

// Research settings
export interface ResearchSettings {
  enableWebSearch: boolean;
  enableDocumentSearch: boolean;
  enableFactCheck: boolean;
  enableAutoSuggestions: boolean;
  maxWebResults: number;
  maxDocumentResults: number;
  cacheExpiration: number; // minutes
  documentPaths: string[];
  searchProviders: SearchProviderConfig[];
}

export const DEFAULT_RESEARCH_SETTINGS: ResearchSettings = {
  enableWebSearch: true,
  enableDocumentSearch: true,
  enableFactCheck: true,
  enableAutoSuggestions: true,
  maxWebResults: 5,
  maxDocumentResults: 10,
  cacheExpiration: 30,
  documentPaths: [],
  searchProviders: [],
};
