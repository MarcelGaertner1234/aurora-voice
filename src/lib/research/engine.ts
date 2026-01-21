// Research Engine for Aurora Meeting Assistant

import { v4 as uuidv4 } from 'uuid';
import { webSearchManager } from './web-search';
import { documentSearchManager } from './document-search';
import {
  DEFAULT_RESEARCH_SETTINGS,
  type ResearchQuery,
  type ResearchResult,
  type ResearchSession,
  type ResearchSuggestion,
  type FactCheckResult,
  type WebSearchResult,
  type DocumentSearchResult,
  type ResearchSettings,
  type ResearchCacheEntry,
  type ResearchEvent,
} from '@/types/research';

// Research event callback
export type ResearchEventCallback = (event: ResearchEvent) => void;

// Research engine options
export interface ResearchEngineOptions {
  settings?: Partial<ResearchSettings>;
  onEvent?: ResearchEventCallback;
}

// Claim patterns for fact-checking
const CLAIM_PATTERNS = [
  /(?:ist|sind|war|waren)\s+(?:das|die|der|es)\s+.+/gi,
  /(?:laut|nach|gemäß)\s+.+/gi,
  /(?:statistisch|nachweislich|bewiesen|bekannt)\s+.+/gi,
  /\d+(?:\.\d+)?%\s+.+/gi,
  /(?:immer|niemals|alle|keine)\s+.+/gi,
];

// Fix H16: Max cache sizes to prevent unbounded memory growth
const MAX_SESSIONS = 50;
const MAX_CACHE_ENTRIES = 200;

export class ResearchEngine {
  private settings: ResearchSettings;
  private sessions: Map<string, ResearchSession> = new Map();
  private cache: Map<string, ResearchCacheEntry> = new Map();
  private eventCallback?: ResearchEventCallback;

  constructor(options: ResearchEngineOptions = {}) {
    this.settings = {
      ...DEFAULT_RESEARCH_SETTINGS,
      ...options.settings,
    };
    this.eventCallback = options.onEvent;
  }

  // Create or get a research session for a meeting
  getSession(meetingId: string): ResearchSession {
    // Fix H16: Enforce max sessions with cleanup of oldest
    if (!this.sessions.has(meetingId) && this.sessions.size >= MAX_SESSIONS) {
      // Remove oldest sessions (by lastActivityAt)
      const sessions = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].lastActivityAt.getTime() - b[1].lastActivityAt.getTime());
      const toRemove = sessions.slice(0, Math.ceil(MAX_SESSIONS * 0.2));
      for (const [k] of toRemove) {
        this.sessions.delete(k);
      }
    }

    if (!this.sessions.has(meetingId)) {
      const session: ResearchSession = {
        id: uuidv4(),
        meetingId,
        queries: [],
        results: new Map(),
        startedAt: new Date(),
        lastActivityAt: new Date(),
      };
      this.sessions.set(meetingId, session);
    }

    const session = this.sessions.get(meetingId)!;
    session.lastActivityAt = new Date();
    return session;
  }

  // Main research method
  async research(
    query: string,
    options: {
      type?: 'web' | 'document' | 'fact_check' | 'all';
      meetingId?: string;
      context?: string;
    } = {}
  ): Promise<ResearchResult> {
    const { type = 'all', meetingId, context } = options;
    const startTime = Date.now();

    // Create query record
    const researchQuery: ResearchQuery = {
      id: uuidv4(),
      query,
      type,
      context,
      createdAt: new Date(),
      meetingId,
    };

    // Emit query started event
    this.emitEvent({
      type: 'query_started',
      queryId: researchQuery.id,
      data: { query, type },
      timestamp: new Date(),
    });

    // Check cache
    const cacheKey = this.getCacheKey(query, type);
    const cached = this.cache.get(cacheKey);
    if (cached && new Date() < cached.expiresAt) {
      cached.hitCount++;
      return { ...cached.result, cached: true };
    }

    // Perform searches
    const webResults: WebSearchResult[] = [];
    const documentResults: DocumentSearchResult[] = [];
    let factCheck: FactCheckResult | undefined;

    // Web search
    if ((type === 'web' || type === 'all') && this.settings.enableWebSearch) {
      try {
        const results = await webSearchManager.search(query, {
          maxResultsPerProvider: this.settings.maxWebResults,
        });
        webResults.push(...results);
        this.emitEvent({
          type: 'web_results',
          queryId: researchQuery.id,
          data: results,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Web search error:', error);
        this.emitEvent({
          type: 'error',
          queryId: researchQuery.id,
          data: { source: 'web', error: String(error) },
          timestamp: new Date(),
        });
      }
    }

    // Document search
    if ((type === 'document' || type === 'all') && this.settings.enableDocumentSearch) {
      try {
        const results = documentSearchManager.search(query, {
          maxResults: this.settings.maxDocumentResults,
        });
        documentResults.push(...results);
        this.emitEvent({
          type: 'document_results',
          queryId: researchQuery.id,
          data: results,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Document search error:', error);
        this.emitEvent({
          type: 'error',
          queryId: researchQuery.id,
          data: { source: 'document', error: String(error) },
          timestamp: new Date(),
        });
      }
    }

    // Fact check
    if ((type === 'fact_check' || type === 'all') && this.settings.enableFactCheck) {
      const claim = this.extractClaim(query);
      if (claim) {
        try {
          factCheck = await this.performFactCheck(claim, webResults);
          this.emitEvent({
            type: 'fact_check_complete',
            queryId: researchQuery.id,
            data: factCheck,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error('Fact check error:', error);
        }
      }
    }

    // Generate summary if we have results
    let summary: string | undefined;
    if (webResults.length > 0 || documentResults.length > 0) {
      summary = this.generateSummary(query, webResults, documentResults);
      this.emitEvent({
        type: 'summary_ready',
        queryId: researchQuery.id,
        data: summary,
        timestamp: new Date(),
      });
    }

    // Create result
    const result: ResearchResult = {
      id: uuidv4(),
      queryId: researchQuery.id,
      query,
      webResults,
      documentResults,
      factCheck,
      summary,
      createdAt: new Date(),
      processingTime: Date.now() - startTime,
      cached: false,
    };

    // Cache result
    this.cacheResult(cacheKey, result);

    // Add to session if meetingId provided
    if (meetingId) {
      const session = this.getSession(meetingId);
      session.queries.push(researchQuery);
      session.results.set(researchQuery.id, result);
    }

    // Emit completion event
    this.emitEvent({
      type: 'query_complete',
      queryId: researchQuery.id,
      data: result,
      timestamp: new Date(),
    });

    return result;
  }

  // Quick web search
  async webSearch(query: string, maxResults?: number): Promise<WebSearchResult[]> {
    return webSearchManager.search(query, {
      maxResultsPerProvider: maxResults || this.settings.maxWebResults,
    });
  }

  // Quick document search
  documentSearch(query: string, maxResults?: number): DocumentSearchResult[] {
    return documentSearchManager.search(query, {
      maxResults: maxResults || this.settings.maxDocumentResults,
    });
  }

  // Generate research suggestions from transcript
  generateSuggestions(
    transcript: string,
    existingQueries: string[] = []
  ): ResearchSuggestion[] {
    if (!this.settings.enableAutoSuggestions) {
      return [];
    }

    const suggestions: ResearchSuggestion[] = [];
    const existingSet = new Set(existingQueries.map(q => q.toLowerCase()));

    // Find potential research topics in transcript
    const patterns = [
      // Questions
      { regex: /(?:was ist|was sind|wer ist|wer war)\s+([^.?!]+)/gi, priority: 'high' as const },
      // Unknown terms
      { regex: /(?:ich weiß nicht|unklar|nicht sicher)\s+(?:was|wer|wie)\s+([^.?!]+)/gi, priority: 'high' as const },
      // Fact claims
      { regex: /(?:laut|nach Angaben von|statistisch)\s+([^.?!]+)/gi, priority: 'medium' as const },
      // Named entities (simplified)
      { regex: /([A-Z][a-zA-Zäöüß]+(?:\s+[A-Z][a-zA-Zäöüß]+)+)/g, priority: 'low' as const },
      // Numbers and statistics
      { regex: /(\d+(?:\.\d+)?(?:\s*%|\s*Euro|\s*Dollar|\s*Millionen?|\s*Milliarden?))/gi, priority: 'medium' as const },
    ];

    for (const { regex, priority } of patterns) {
      const matches = transcript.matchAll(regex);
      for (const match of matches) {
        const query = match[1]?.trim();
        if (query && query.length > 3 && !existingSet.has(query.toLowerCase())) {
          existingSet.add(query.toLowerCase());

          // Find the position in transcript
          const timestamp = this.estimateTimestamp(transcript, match.index || 0);

          suggestions.push({
            id: uuidv4(),
            query,
            reason: this.getSuggestionReason(match[0]),
            priority,
            triggerText: match[0].slice(0, 100),
            timestamp,
            dismissed: false,
          });
        }
      }
    }

    // Limit suggestions
    return suggestions
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, 5);
  }

  // Update settings
  updateSettings(settings: Partial<ResearchSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  // Get current settings
  getSettings(): ResearchSettings {
    return { ...this.settings };
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
    webSearchManager.clearCache();
  }

  // Get session history
  getSessionHistory(meetingId: string): ResearchResult[] {
    const session = this.sessions.get(meetingId);
    if (!session) return [];
    return Array.from(session.results.values());
  }

  // Private methods

  private emitEvent(event: ResearchEvent): void {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  private getCacheKey(query: string, type: string): string {
    return `${query.toLowerCase().trim()}:${type}`;
  }

  private cacheResult(key: string, result: ResearchResult): void {
    // Fix H16: Enforce max cache size with LRU-like cleanup
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Remove expired entries first
      const now = new Date();
      for (const [k, v] of this.cache) {
        if (v.expiresAt < now) {
          this.cache.delete(k);
        }
      }

      // If still over limit, remove oldest entries (lowest hit count)
      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        const entries = Array.from(this.cache.entries())
          .sort((a, b) => a[1].hitCount - b[1].hitCount);
        const toRemove = entries.slice(0, Math.ceil(MAX_CACHE_ENTRIES * 0.2));
        for (const [k] of toRemove) {
          this.cache.delete(k);
        }
      }
    }

    const entry: ResearchCacheEntry = {
      query: result.query,
      queryHash: key,
      result,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + this.settings.cacheExpiration * 60 * 1000),
      hitCount: 0,
    };
    this.cache.set(key, entry);
  }

  private extractClaim(text: string): string | null {
    for (const pattern of CLAIM_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  private async performFactCheck(
    claim: string,
    supportingResults: WebSearchResult[]
  ): Promise<FactCheckResult> {
    // Simple fact check based on source analysis
    // In production, this would use a proper fact-checking API or LLM

    const sources = supportingResults.slice(0, 3);
    let confidence = 0.5;
    let verdict: FactCheckResult['verdict'] = 'unverified';

    // Check if multiple sources agree
    if (sources.length >= 2) {
      const snippets = sources.map(s => s.snippet.toLowerCase());
      const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);

      let matchCount = 0;
      for (const snippet of snippets) {
        const matches = claimWords.filter(word => snippet.includes(word)).length;
        if (matches >= claimWords.length * 0.5) {
          matchCount++;
        }
      }

      if (matchCount >= 2) {
        verdict = 'partially_true';
        confidence = 0.6 + (matchCount * 0.1);
      }
    }

    // Check for Wikipedia source (higher reliability)
    if (sources.some(s => s.source === 'Wikipedia')) {
      confidence = Math.min(1, confidence + 0.2);
    }

    return {
      id: uuidv4(),
      claim,
      verdict,
      confidence: Math.min(1, confidence),
      explanation: this.generateFactCheckExplanation(claim, verdict, sources.length),
      sources,
      checkedAt: new Date(),
    };
  }

  private generateFactCheckExplanation(
    claim: string,
    verdict: FactCheckResult['verdict'],
    sourceCount: number
  ): string {
    const verdictTexts: Record<FactCheckResult['verdict'], string> = {
      true: 'Diese Aussage wird von mehreren Quellen bestätigt.',
      false: 'Diese Aussage konnte nicht bestätigt werden.',
      partially_true: 'Diese Aussage ist teilweise korrekt, enthält aber möglicherweise Ungenauigkeiten.',
      unverified: 'Diese Aussage konnte nicht ausreichend verifiziert werden.',
      disputed: 'Diese Aussage wird von verschiedenen Quellen unterschiedlich bewertet.',
    };

    return `${verdictTexts[verdict]} (${sourceCount} Quellen analysiert)`;
  }

  private generateSummary(
    query: string,
    webResults: WebSearchResult[],
    documentResults: DocumentSearchResult[]
  ): string {
    const parts: string[] = [];

    if (webResults.length > 0) {
      const topResult = webResults[0];
      parts.push(`**Web:** ${topResult.snippet.slice(0, 200)}...`);
      parts.push(`Quelle: ${topResult.source}`);
    }

    if (documentResults.length > 0) {
      const topDoc = documentResults[0];
      parts.push(`**Dokument:** ${topDoc.matchedText.slice(0, 200)}...`);
      parts.push(`Datei: ${topDoc.filename}`);
    }

    if (parts.length === 0) {
      return `Keine relevanten Ergebnisse für "${query}" gefunden.`;
    }

    return parts.join('\n\n');
  }

  private getSuggestionReason(triggerText: string): string {
    if (/was ist|was sind|wer ist/i.test(triggerText)) {
      return 'Frage erkannt';
    }
    if (/unklar|nicht sicher/i.test(triggerText)) {
      return 'Unsicherheit erkannt';
    }
    if (/laut|statistisch/i.test(triggerText)) {
      return 'Faktenbehauptung erkannt';
    }
    if (/\d+/.test(triggerText)) {
      return 'Zahlenangabe erkannt';
    }
    return 'Relevanter Begriff erkannt';
  }

  private estimateTimestamp(text: string, charIndex: number): number {
    // Rough estimate: 150 words per minute, 5 chars per word average
    const wordsPerMinute = 150;
    const charsPerWord = 5;
    const charsPerMinute = wordsPerMinute * charsPerWord;
    return Math.floor((charIndex / charsPerMinute) * 60 * 1000);
  }
}

// Create singleton instance
export const researchEngine = new ResearchEngine();
