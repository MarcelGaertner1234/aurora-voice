// Web Search Module for Aurora Meeting Assistant

import { v4 as uuidv4 } from 'uuid';
import type { WebSearchResult, SearchProviderConfig } from '@/types/research';

// DuckDuckGo Instant Answer API response types
interface DuckDuckGoResponse {
  Abstract: string;
  AbstractText: string;
  AbstractSource: string;
  AbstractURL: string;
  Answer: string;
  AnswerType: string;
  Definition: string;
  DefinitionSource: string;
  DefinitionURL: string;
  Entity: string;
  Heading: string;
  Image: string;
  ImageHeight: number;
  ImageIsLogo: number;
  ImageWidth: number;
  Infobox: {
    content: { data_type: string; label: string; value: string }[];
    meta: { data_type: string; label: string; value: string }[];
  };
  Redirect: string;
  RelatedTopics: DuckDuckGoRelatedTopic[];
  Results: DuckDuckGoResult[];
  Type: string;
}

interface DuckDuckGoRelatedTopic {
  FirstURL: string;
  Icon: { Height: string; URL: string; Width: string };
  Result: string;
  Text: string;
  Name?: string;
  Topics?: DuckDuckGoRelatedTopic[];
}

interface DuckDuckGoResult {
  FirstURL: string;
  Icon: { Height: string; URL: string; Width: string };
  Result: string;
  Text: string;
}

// Search provider interface
export interface SearchProvider {
  id: string;
  name: string;
  search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}

// DuckDuckGo search provider (free, no API key required)
export class DuckDuckGoProvider implements SearchProvider {
  id = 'duckduckgo';
  name = 'DuckDuckGo';

  async search(query: string, maxResults: number = 5): Promise<WebSearchResult[]> {
    // Fix M7: Add 10s timeout for DuckDuckGo API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Use DuckDuckGo Instant Answer API
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed: ${response.statusText}`);
      }

      const data: DuckDuckGoResponse = await response.json();
      const results: WebSearchResult[] = [];

      // Add abstract if available
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          id: uuidv4(),
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
          source: data.AbstractSource || 'DuckDuckGo',
          relevanceScore: 1.0,
        });
      }

      // Add answer if available
      if (data.Answer && !data.AbstractText) {
        results.push({
          id: uuidv4(),
          title: `Answer: ${query}`,
          url: `https://duckduckgo.com/?q=${encodedQuery}`,
          snippet: data.Answer,
          source: 'DuckDuckGo',
          relevanceScore: 1.0,
        });
      }

      // Add definition if available
      if (data.Definition && data.DefinitionURL) {
        results.push({
          id: uuidv4(),
          title: `Definition: ${data.Heading || query}`,
          url: data.DefinitionURL,
          snippet: data.Definition,
          source: data.DefinitionSource || 'DuckDuckGo',
          relevanceScore: 0.9,
        });
      }

      // Add related topics
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            id: uuidv4(),
            title: extractTitle(topic.Result || topic.Text),
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'DuckDuckGo',
            relevanceScore: 0.7,
          });
        }

        // Handle nested topics
        if (topic.Topics) {
          for (const subtopic of topic.Topics) {
            if (results.length >= maxResults) break;
            if (subtopic.Text && subtopic.FirstURL) {
              results.push({
                id: uuidv4(),
                title: extractTitle(subtopic.Result || subtopic.Text),
                url: subtopic.FirstURL,
                snippet: subtopic.Text,
                source: 'DuckDuckGo',
                relevanceScore: 0.6,
              });
            }
          }
        }
      }

      // Add direct results
      for (const result of data.Results.slice(0, maxResults - results.length)) {
        if (result.Text && result.FirstURL) {
          results.push({
            id: uuidv4(),
            title: extractTitle(result.Result || result.Text),
            url: result.FirstURL,
            snippet: result.Text,
            source: 'DuckDuckGo',
            relevanceScore: 0.8,
          });
        }
      }

      return results.slice(0, maxResults);
    } catch (error) {
      console.error('DuckDuckGo search error:', error);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Wikipedia search provider
export class WikipediaProvider implements SearchProvider {
  id = 'wikipedia';
  name = 'Wikipedia';
  private language: string;

  constructor(language: string = 'de') {
    this.language = language;
  }

  async search(query: string, maxResults: number = 5): Promise<WebSearchResult[]> {
    // Fix M8: Add 10s timeout for Wikipedia API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://${this.language}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&format=json&origin=*&srlimit=${maxResults}`;

      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Wikipedia search failed: ${response.statusText}`);
      }

      const data = await response.json();
      const results: WebSearchResult[] = [];

      // Fix M5: Add optional chaining for safer API response handling
      if (data.query?.search) {
        for (const item of data.query.search) {
          results.push({
            id: uuidv4(),
            title: item.title,
            url: `https://${this.language}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
            snippet: stripHtml(item.snippet),
            source: 'Wikipedia',
            relevanceScore: calculateRelevance(query, item.title, item.snippet),
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Wikipedia search error:', error);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Fix H17: Max cache size to prevent unbounded memory growth
const MAX_WEB_CACHE_ENTRIES = 100;

// Web search manager
export class WebSearchManager {
  private providers: Map<string, SearchProvider> = new Map();
  private cache: Map<string, { results: WebSearchResult[]; timestamp: number }> = new Map();
  private cacheExpiration: number = 30 * 60 * 1000; // 30 minutes

  constructor(cacheExpirationMinutes?: number) {
    // Register default providers
    this.registerProvider(new DuckDuckGoProvider());
    this.registerProvider(new WikipediaProvider('de'));
    this.registerProvider(new WikipediaProvider('en'));

    if (cacheExpirationMinutes) {
      this.cacheExpiration = cacheExpirationMinutes * 60 * 1000;
    }
  }

  registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  removeProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  getProviders(): SearchProvider[] {
    return Array.from(this.providers.values());
  }

  async search(
    query: string,
    options: {
      providers?: string[];
      maxResultsPerProvider?: number;
      useCache?: boolean;
    } = {}
  ): Promise<WebSearchResult[]> {
    // Fix M12: Validate query length to prevent API issues
    if (!query || query.trim().length === 0) {
      return [];
    }
    const sanitizedQuery = query.slice(0, 256).trim(); // Max 256 chars

    const {
      providers: providerIds,
      maxResultsPerProvider = 5,
      useCache = true,
    } = options;

    // Check cache
    const cacheKey = this.getCacheKey(sanitizedQuery, providerIds);
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
        return cached.results;
      }
    }

    // Determine which providers to use
    const selectedProviders = providerIds
      ? providerIds.map(id => this.providers.get(id)).filter(Boolean) as SearchProvider[]
      : Array.from(this.providers.values());

    // Search all providers in parallel (using sanitized query)
    const searchPromises = selectedProviders.map(provider =>
      provider.search(sanitizedQuery, maxResultsPerProvider).catch(error => {
        console.error(`Search error for ${provider.name}:`, error);
        return [] as WebSearchResult[];
      })
    );

    const resultsArrays = await Promise.all(searchPromises);

    // Combine and deduplicate results
    const allResults = resultsArrays.flat();
    const uniqueResults = this.deduplicateResults(allResults);

    // Sort by relevance
    uniqueResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Cache results
    if (useCache) {
      // Fix H17: Enforce max cache size with cleanup
      if (this.cache.size >= MAX_WEB_CACHE_ENTRIES) {
        // Remove expired entries first
        const now = Date.now();
        for (const [k, v] of this.cache) {
          if (now - v.timestamp > this.cacheExpiration) {
            this.cache.delete(k);
          }
        }

        // If still over limit, remove oldest 20%
        if (this.cache.size >= MAX_WEB_CACHE_ENTRIES) {
          const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
          const toRemove = entries.slice(0, Math.ceil(MAX_WEB_CACHE_ENTRIES * 0.2));
          for (const [k] of toRemove) {
            this.cache.delete(k);
          }
        }
      }

      this.cache.set(cacheKey, {
        results: uniqueResults,
        timestamp: Date.now(),
      });
    }

    return uniqueResults;
  }

  async searchWithProvider(
    providerId: string,
    query: string,
    maxResults: number = 5
  ): Promise<WebSearchResult[]> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return provider.search(query, maxResults);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getCacheKey(query: string, providers?: string[]): string {
    const normalizedQuery = query.toLowerCase().trim();
    const providerKey = providers?.sort().join(',') || 'all';
    return `${normalizedQuery}:${providerKey}`;
  }

  private deduplicateResults(results: WebSearchResult[]): WebSearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      // Normalize URL for comparison
      const normalizedUrl = result.url.toLowerCase().replace(/\/$/, '');
      if (seen.has(normalizedUrl)) {
        return false;
      }
      seen.add(normalizedUrl);
      return true;
    });
  }
}

// Utility functions
function extractTitle(htmlOrText: string): string {
  // Extract text before the first HTML tag or dash
  const match = htmlOrText.match(/^([^<-]+)/);
  return match ? match[1].trim() : htmlOrText.slice(0, 100);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}

function calculateRelevance(query: string, title: string, snippet: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const titleLower = title.toLowerCase();
  const snippetLower = snippet.toLowerCase();

  let score = 0;
  for (const word of queryWords) {
    if (titleLower.includes(word)) score += 0.4;
    if (snippetLower.includes(word)) score += 0.2;
  }

  // Exact title match bonus
  if (titleLower === query.toLowerCase()) score += 0.3;

  return Math.min(1, score);
}

// Create singleton instance
export const webSearchManager = new WebSearchManager();
