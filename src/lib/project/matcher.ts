// Project Matcher for Aurora Voice
// Matches transcript text with project files using various strategies

import type {
  ProjectContext,
  ProjectFile,
  ProjectMatch,
  MatchType,
} from '@/types/project';

// Common patterns for file/component references in speech
const FILE_MENTION_PATTERNS = [
  // Direct file mentions
  /(?:datei|file|in|die|das|der|den)\s+["']?([a-zA-Z0-9_\-./]+(?:\.[a-zA-Z]+)?)["']?/gi,
  // Component/class mentions
  /(?:komponente|component|klasse|class|modul|module|service|controller|store|hook)\s+["']?([a-zA-Z][a-zA-Z0-9_]+)["']?/gi,
  // Function mentions
  /(?:funktion|function|methode|method)\s+["']?([a-zA-Z][a-zA-Z0-9_]+)["']?/gi,
  // Path-like mentions
  /(?:src|lib|app|components|pages|api)[/\\][\w\-./\\]+/gi,
  // CamelCase or PascalCase identifiers
  /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g,
  // snake_case identifiers (often file names)
  /\b([a-z]+(?:_[a-z]+)+)\b/g,
];

// Words to ignore when matching
const IGNORE_WORDS = new Set([
  'und', 'oder', 'aber', 'dann', 'wir', 'ich', 'du', 'sie', 'es',
  'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einer', 'einem',
  'the', 'and', 'or', 'but', 'then', 'we', 'you', 'it', 'they',
  'this', 'that', 'these', 'those', 'a', 'an',
  'müssen', 'sollen', 'können', 'muss', 'soll', 'kann',
  'should', 'must', 'can', 'will', 'would',
]);

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Calculate similarity score (0-1) between two strings
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

// Convert camelCase/PascalCase to separate words
function camelToWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 1);
}

// Extract potential file/component references from text
// Fix: Add protection against infinite loops in regex matching
function extractReferences(text: string): Set<string> {
  const references = new Set<string>();
  const MAX_MATCHES = 1000; // Prevent runaway matching

  for (const pattern of FILE_MENTION_PATTERNS) {
    let match;
    let matchCount = 0;
    let lastIndex = -1;

    // Reset regex state
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      // Fix: Prevent infinite loop if regex matches empty string or same position
      if (pattern.lastIndex === lastIndex || matchCount >= MAX_MATCHES) {
        break;
      }
      lastIndex = pattern.lastIndex;
      matchCount++;

      const ref = match[1] || match[0];
      if (ref && ref.length > 2 && !IGNORE_WORDS.has(ref.toLowerCase())) {
        references.add(ref);
      }

      // Fix: For non-global patterns, break after first match
      if (!pattern.global) {
        break;
      }
    }
  }

  return references;
}

// Match a reference against a project file
function matchFileToReference(
  file: ProjectFile,
  reference: string
): { matchType: MatchType; relevance: number } | null {
  const lowerRef = reference.toLowerCase();
  const lowerName = file.name.toLowerCase();
  const lowerPath = file.path.toLowerCase();
  const nameWithoutExt = lowerName.replace(/\.[^.]+$/, '');

  // Exact match on filename (without extension)
  if (nameWithoutExt === lowerRef) {
    return { matchType: 'exact', relevance: 1.0 };
  }

  // Exact match on full filename
  if (lowerName === lowerRef) {
    return { matchType: 'exact', relevance: 1.0 };
  }

  // Partial match - reference is contained in filename
  if (nameWithoutExt.includes(lowerRef) || lowerRef.includes(nameWithoutExt)) {
    const containmentRatio = Math.min(lowerRef.length, nameWithoutExt.length) /
      Math.max(lowerRef.length, nameWithoutExt.length);
    return { matchType: 'partial', relevance: 0.7 + containmentRatio * 0.2 };
  }

  // Path-based partial match
  if (lowerPath.includes(lowerRef)) {
    return { matchType: 'partial', relevance: 0.6 };
  }

  // Fuzzy match using Levenshtein distance
  const similarity = calculateSimilarity(nameWithoutExt, lowerRef);
  if (similarity > 0.7) {
    return { matchType: 'fuzzy', relevance: similarity * 0.8 };
  }

  // Try matching against camelCase words
  const fileWords = camelToWords(file.name.replace(/\.[^.]+$/, ''));
  const refWords = camelToWords(reference);

  if (fileWords.length > 0 && refWords.length > 0) {
    const matchingWords = refWords.filter((rw) =>
      fileWords.some((fw) => fw === rw || calculateSimilarity(fw, rw) > 0.8)
    );

    if (matchingWords.length > 0) {
      const wordMatchRatio = matchingWords.length / refWords.length;
      return { matchType: 'fuzzy', relevance: 0.5 + wordMatchRatio * 0.3 };
    }
  }

  return null;
}

// Main matching function
export function findMatchingFiles(
  text: string,
  context: ProjectContext,
  options: {
    minRelevance?: number;
    maxResults?: number;
    matchTypes?: MatchType[];
  } = {}
): ProjectMatch[] {
  const {
    minRelevance = 0.5,
    maxResults = 10,
    matchTypes = ['exact', 'partial', 'fuzzy'],
  } = options;

  const references = extractReferences(text);
  const matches: ProjectMatch[] = [];
  const seenFiles = new Set<string>();

  for (const reference of references) {
    for (const file of context.files) {
      // Skip already matched files
      if (seenFiles.has(file.path)) continue;

      const result = matchFileToReference(file, reference);
      if (result && result.relevance >= minRelevance && matchTypes.includes(result.matchType)) {
        seenFiles.add(file.path);
        matches.push({
          file,
          matchType: result.matchType,
          relevance: result.relevance,
          matchedText: reference,
        });
      }
    }
  }

  // Sort by relevance and limit results
  return matches
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults);
}

// Find matches for a specific search term
export function searchProjectFiles(
  query: string,
  context: ProjectContext,
  options: {
    includeSnippets?: boolean;
    maxResults?: number;
  } = {}
): ProjectMatch[] {
  const { includeSnippets = false, maxResults = 20 } = options;
  const lowerQuery = query.toLowerCase();
  const matches: ProjectMatch[] = [];

  for (const file of context.files) {
    const lowerName = file.name.toLowerCase();
    const lowerPath = file.path.toLowerCase();

    let matchType: MatchType | null = null;
    let relevance = 0;

    // Check filename
    if (lowerName.includes(lowerQuery)) {
      if (lowerName === lowerQuery || lowerName.replace(/\.[^.]+$/, '') === lowerQuery) {
        matchType = 'exact';
        relevance = 1.0;
      } else {
        matchType = 'partial';
        relevance = 0.8;
      }
    }
    // Check path
    else if (lowerPath.includes(lowerQuery)) {
      matchType = 'partial';
      relevance = 0.6;
    }
    // Check snippet if enabled
    else if (includeSnippets && file.snippet?.toLowerCase().includes(lowerQuery)) {
      matchType = 'partial';
      relevance = 0.4;
    }
    // Fuzzy match
    else {
      const similarity = calculateSimilarity(
        file.name.replace(/\.[^.]+$/, ''),
        query
      );
      if (similarity > 0.6) {
        matchType = 'fuzzy';
        relevance = similarity * 0.7;
      }
    }

    if (matchType) {
      matches.push({
        file,
        matchType,
        relevance,
        matchedText: query,
      });
    }
  }

  return matches
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults);
}

// Analyze transcript segments for file mentions
export function analyzeTranscriptForFiles(
  segments: { text: string; timestamp?: number }[],
  context: ProjectContext
): { text: string; timestamp?: number; matches: ProjectMatch[] }[] {
  return segments.map((segment) => ({
    ...segment,
    matches: findMatchingFiles(segment.text, context, {
      minRelevance: 0.6,
      maxResults: 3,
    }),
  }));
}

// Get file suggestions based on recent matches
export function getRelatedFiles(
  match: ProjectMatch,
  context: ProjectContext,
  maxSuggestions = 5
): ProjectFile[] {
  const dir = match.file.path.substring(0, match.file.path.lastIndexOf('/'));

  // Find files in the same directory or with similar names
  const related = context.files.filter((f) => {
    if (f.path === match.file.path) return false;

    // Same directory
    if (f.path.startsWith(dir + '/') && !f.path.slice(dir.length + 1).includes('/')) {
      return true;
    }

    // Similar name pattern
    const baseNameA = match.file.name.replace(/\.[^.]+$/, '');
    const baseNameB = f.name.replace(/\.[^.]+$/, '');
    if (calculateSimilarity(baseNameA, baseNameB) > 0.5) {
      return true;
    }

    return false;
  });

  return related.slice(0, maxSuggestions);
}

// Format matches for display
export function formatMatchesForPrompt(matches: ProjectMatch[]): string {
  if (matches.length === 0) return '';

  return matches
    .map((m) => {
      let confidence = '';
      if (m.matchType === 'exact') confidence = '(exakt)';
      else if (m.matchType === 'partial') confidence = '(teilweise)';
      else confidence = '(ähnlich)';

      return `- ${m.file.path} ${confidence} [erwähnt als "${m.matchedText}"]`;
    })
    .join('\n');
}

// Export simple file path list for AI prompts
export function getRelevantPathsForPrompt(
  matches: ProjectMatch[],
  limit = 10
): string[] {
  return matches
    .slice(0, limit)
    .map((m) => m.file.path);
}
