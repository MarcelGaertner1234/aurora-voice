// Live Meeting Features for Aurora Meeting Assistant

import type { TranscriptSegment } from '@/types/meeting';

// Keyword categories for highlighting
export interface KeywordCategory {
  id: string;
  label: string;
  keywords: string[];
  color: string;
  icon?: string;
}

// Default keyword categories
export const DEFAULT_KEYWORD_CATEGORIES: KeywordCategory[] = [
  {
    id: 'deadline',
    label: 'Termine',
    keywords: [
      'deadline', 'frist', 'bis zum', 'spätestens', 'termin',
      'bis ende', 'nächste woche', 'nächsten monat', 'morgen',
      'übermorgen', 'bis freitag', 'bis montag', 'zeitplan',
    ],
    color: '#ef4444', // red
    icon: 'clock',
  },
  {
    id: 'decision',
    label: 'Entscheidungen',
    keywords: [
      'entschieden', 'beschlossen', 'vereinbart', 'abgemacht',
      'wir machen', 'wir werden', 'festgelegt', 'genehmigt',
      'einverstanden', 'okay dann', 'gut dann machen wir',
    ],
    color: '#22c55e', // green
    icon: 'check',
  },
  {
    id: 'action',
    label: 'Aufgaben',
    keywords: [
      'todo', 'aufgabe', 'übernimmst du', 'machst du', 'kümmere mich',
      'ich werde', 'ich mache', 'verantwortlich', 'zuständig',
      'bitte mach', 'kannst du', 'könntest du',
    ],
    color: '#3b82f6', // blue
    icon: 'task',
  },
  {
    id: 'budget',
    label: 'Budget',
    keywords: [
      'budget', 'kosten', 'euro', 'geld', 'ausgaben', 'investition',
      'preis', 'betrag', 'finanzierung', 'ressourcen', 'aufwand',
    ],
    color: '#f59e0b', // amber
    icon: 'currency',
  },
  {
    id: 'question',
    label: 'Fragen',
    keywords: [
      'frage', 'wie', 'was', 'warum', 'wann', 'wer', 'wo',
      'können wir', 'sollten wir', 'müssen wir', 'unklar',
      'nicht sicher', 'klären', 'offen',
    ],
    color: '#8b5cf6', // violet
    icon: 'question',
  },
  {
    id: 'risk',
    label: 'Risiken',
    keywords: [
      'risiko', 'problem', 'schwierigkeit', 'bedenken', 'gefahr',
      'kritisch', 'blockiert', 'verzögerung', 'hindernis',
      'nicht möglich', 'scheitern', 'fehler',
    ],
    color: '#ec4899', // pink
    icon: 'alert',
  },
];

// Detected keyword match
export interface KeywordMatch {
  categoryId: string;
  keyword: string;
  startIndex: number;
  endIndex: number;
  context: string;
}

// Detect keywords in text
export function detectKeywords(
  text: string,
  categories: KeywordCategory[] = DEFAULT_KEYWORD_CATEGORIES
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const category of categories) {
    for (const keyword of category.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      let index = 0;

      while ((index = lowerText.indexOf(lowerKeyword, index)) !== -1) {
        // Get context (surrounding words)
        const contextStart = Math.max(0, index - 30);
        const contextEnd = Math.min(text.length, index + keyword.length + 30);
        const context = text.slice(contextStart, contextEnd);

        matches.push({
          categoryId: category.id,
          keyword,
          startIndex: index,
          endIndex: index + keyword.length,
          context: contextStart > 0 ? '...' + context : context,
        });

        index += keyword.length;
      }
    }
  }

  // Sort by position
  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

// Decision detection patterns
const DECISION_PATTERNS = [
  /(?:wir haben|wir|ich habe|haben wir) (?:uns )?(entschieden|beschlossen|festgelegt|vereinbart)/gi,
  /(?:es wurde|wurde) (entschieden|beschlossen|festgelegt|vereinbart)/gi,
  /(?:die entscheidung|der beschluss) (?:ist|lautet|wurde)/gi,
  /(?:abgemacht|einverstanden|okay|gut)[,.]?\s*(?:dann|wir)/gi,
  /(?:wir machen|wir werden|wir gehen mit) .{5,100}/gi,
  /(?:final|endgültig|definitiv)[:\s]+.{5,100}/gi,
];

// Detected decision
export interface DetectedDecision {
  text: string;
  confidence: number;
  timestamp: number;
  speakerId?: string;
  pattern: string;
}

// Detect decisions in transcript segment
export function detectDecision(segment: TranscriptSegment): DetectedDecision | null {
  const text = segment.text;

  for (const pattern of DECISION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract the decision text (the matched portion plus context)
      const matchIndex = text.toLowerCase().indexOf(match[0].toLowerCase());

      // Fix H7: Guard against indexOf returning -1 (shouldn't happen but defensive coding)
      if (matchIndex === -1) {
        continue;
      }

      const sentenceEnd = text.indexOf('.', matchIndex);
      const decisionText = sentenceEnd > matchIndex
        ? text.slice(matchIndex, sentenceEnd + 1)
        : text.slice(matchIndex);

      return {
        text: decisionText.trim(),
        confidence: 0.7 + (match[1] ? 0.2 : 0), // Higher confidence if we matched a specific word
        timestamp: segment.startTime,
        speakerId: segment.speakerId ?? undefined,
        pattern: pattern.source,
      };
    }
  }

  return null;
}

// Question detection patterns
const QUESTION_PATTERNS = [
  /(?:^|\.\s*)(?:wer|was|wann|wo|wie|warum|weshalb|wieso|welche[rs]?)\s+[^.?]+\??/gi,
  /(?:^|\.\s*)(?:können|könnten|sollten|müssen|dürfen)\s+(?:wir|sie|du)\s+[^.?]+\??/gi,
  /(?:^|\.\s*)(?:ist|sind|hat|haben|war|waren)\s+(?:das|es|die|der)\s+[^.?]+\??/gi,
  /(?:ich frage mich|die frage ist|offene frage|unklar ist)/gi,
];

// Detected question
export interface DetectedQuestion {
  text: string;
  timestamp: number;
  speakerId?: string;
  isRhetorical: boolean;
}

// Detect questions in transcript segment
export function detectQuestions(segment: TranscriptSegment): DetectedQuestion[] {
  const questions: DetectedQuestion[] = [];
  const text = segment.text;

  // First, check for explicit question marks
  const questionMarkSentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().endsWith('?'));

  for (const sentence of questionMarkSentences) {
    // Check if it's likely rhetorical
    const isRhetorical = /(?:oder nicht|nicht wahr|richtig|stimmts)/i.test(sentence);

    questions.push({
      text: sentence.trim(),
      timestamp: segment.startTime,
      speakerId: segment.speakerId ?? undefined,
      isRhetorical,
    });
  }

  // Also check patterns for questions without question marks
  for (const pattern of QUESTION_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const questionText = match[0].trim();

      // Skip if already captured via question mark
      if (questions.some(q => q.text.includes(questionText.slice(0, 20)))) {
        continue;
      }

      // Skip short matches that are likely false positives
      if (questionText.length < 10) continue;

      questions.push({
        text: questionText,
        timestamp: segment.startTime,
        speakerId: segment.speakerId ?? undefined,
        isRhetorical: false,
      });
    }
  }

  return questions;
}

// Live meeting state
export interface LiveMeetingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  segments: TranscriptSegment[];
  decisions: DetectedDecision[];
  questions: DetectedQuestion[];
  keywordMatches: Map<string, KeywordMatch[]>; // segmentId -> matches
  speakerChanges: number;
  wordCount: number;
}

// Create initial state
export function createLiveMeetingState(): LiveMeetingState {
  return {
    isRecording: false,
    isPaused: false,
    duration: 0,
    segments: [],
    decisions: [],
    questions: [],
    keywordMatches: new Map(),
    speakerChanges: 0,
    wordCount: 0,
  };
}

// Process new transcript segment
export function processSegment(
  state: LiveMeetingState,
  segment: TranscriptSegment,
  categories: KeywordCategory[] = DEFAULT_KEYWORD_CATEGORIES
): LiveMeetingState {
  // Detect keywords
  const keywords = detectKeywords(segment.text, categories);

  // Detect decisions
  const decision = detectDecision(segment);

  // Detect questions
  const questions = detectQuestions(segment);

  // Count speaker changes
  const lastSegment = state.segments[state.segments.length - 1];
  const speakerChanged = lastSegment && lastSegment.speakerId !== segment.speakerId;

  // Count words
  const words = segment.text.split(/\s+/).filter(w => w.length > 0).length;

  // Create segment ID if not present
  const segmentId = `segment-${segment.startTime}`;

  return {
    ...state,
    segments: [...state.segments, segment],
    decisions: decision ? [...state.decisions, decision] : state.decisions,
    questions: [...state.questions, ...questions],
    keywordMatches: new Map(state.keywordMatches).set(segmentId, keywords),
    speakerChanges: state.speakerChanges + (speakerChanged ? 1 : 0),
    wordCount: state.wordCount + words,
  };
}

// Get all keywords for a category
export function getKeywordsByCategory(
  state: LiveMeetingState,
  categoryId: string
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];

  for (const segmentMatches of state.keywordMatches.values()) {
    for (const match of segmentMatches) {
      if (match.categoryId === categoryId) {
        matches.push(match);
      }
    }
  }

  return matches;
}

// Get meeting statistics
export interface LiveMeetingStats {
  duration: number;
  segmentCount: number;
  wordCount: number;
  wordsPerMinute: number;
  speakerChanges: number;
  decisionCount: number;
  questionCount: number;
  openQuestionCount: number;
  keywordCounts: Record<string, number>;
}

export function getLiveMeetingStats(
  state: LiveMeetingState,
  categories: KeywordCategory[] = DEFAULT_KEYWORD_CATEGORIES
): LiveMeetingStats {
  const durationMinutes = state.duration / 60000;

  const keywordCounts: Record<string, number> = {};
  for (const category of categories) {
    keywordCounts[category.id] = getKeywordsByCategory(state, category.id).length;
  }

  return {
    duration: state.duration,
    segmentCount: state.segments.length,
    wordCount: state.wordCount,
    wordsPerMinute: durationMinutes > 0 ? Math.round(state.wordCount / durationMinutes) : 0,
    speakerChanges: state.speakerChanges,
    decisionCount: state.decisions.length,
    questionCount: state.questions.length,
    openQuestionCount: state.questions.filter(q => !q.isRhetorical).length,
    keywordCounts,
  };
}

// Highlight text with keywords
export interface HighlightedSegment {
  text: string;
  isHighlighted: boolean;
  categoryId?: string;
  color?: string;
}

export function highlightText(
  text: string,
  matches: KeywordMatch[],
  categories: KeywordCategory[] = DEFAULT_KEYWORD_CATEGORIES
): HighlightedSegment[] {
  if (matches.length === 0) {
    return [{ text, isHighlighted: false }];
  }

  const segments: HighlightedSegment[] = [];
  let lastIndex = 0;

  // Sort matches by start index
  const sortedMatches = [...matches].sort((a, b) => a.startIndex - b.startIndex);

  for (const match of sortedMatches) {
    // Skip overlapping matches
    if (match.startIndex < lastIndex) continue;

    // Add non-highlighted text before this match
    if (match.startIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.startIndex),
        isHighlighted: false,
      });
    }

    // Add highlighted match
    const category = categories.find(c => c.id === match.categoryId);
    segments.push({
      text: text.slice(match.startIndex, match.endIndex),
      isHighlighted: true,
      categoryId: match.categoryId,
      color: category?.color,
    });

    lastIndex = match.endIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isHighlighted: false,
    });
  }

  return segments;
}

// Custom keyword category builder
export function createKeywordCategory(
  id: string,
  label: string,
  keywords: string[],
  color: string,
  icon?: string
): KeywordCategory {
  return { id, label, keywords, color, icon };
}

// Merge custom categories with defaults
export function mergeKeywordCategories(
  customCategories: KeywordCategory[],
  includeDefaults: boolean = true
): KeywordCategory[] {
  if (!includeDefaults) {
    return customCategories;
  }

  const merged = [...DEFAULT_KEYWORD_CATEGORIES];

  for (const custom of customCategories) {
    const existingIndex = merged.findIndex(c => c.id === custom.id);
    if (existingIndex >= 0) {
      // Merge keywords
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...custom,
        keywords: [...new Set([...merged[existingIndex].keywords, ...custom.keywords])],
      };
    } else {
      merged.push(custom);
    }
  }

  return merged;
}
