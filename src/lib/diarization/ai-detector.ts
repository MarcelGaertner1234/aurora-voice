// AI-based Speaker Change Detection for Aurora Meeting Assistant
// Uses LLM to detect speaker changes in transcript text

import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Settings } from '@/types';
import type { SpeakerChangeDetection, SpeakerSegment } from '@/types/speaker';
import { processStreamWithTimeout } from '@/lib/ai/stream-utils';

// Build prompt for speaker change detection
function buildSpeakerDetectionPrompt(participantNames?: string[]): string {
  const participantSection = participantNames && participantNames.length > 0
    ? `
BEKANNTE TEILNEHMER DIESES MEETINGS:
${participantNames.map(name => `- ${name}`).join('\n')}

Wenn du einen dieser Namen im Text erkennst oder jemand direkt angesprochen wird,
ordne den Sprecher einem Teilnehmer zu. Bevorzuge bekannte Teilnehmer bei der Zuordnung.
`
    : '';

  return `Du bist ein Experte für die Analyse von Transkripten und die Erkennung von Sprecherwechseln.

Analysiere das folgende Transkript-Segment und identifiziere Sprecherwechsel.
${participantSection}
Achte auf folgende Hinweise für Sprecherwechsel:
1. Direkte Anreden ("Peter, was denkst du?", "Ja, Maria...")
2. Pronomen-Wechsel (von "ich" zu "wir" oder umgekehrt)
3. Themen- oder Perspektivwechsel
4. Frage-Antwort-Muster
5. Unterbrechungen oder "Ja, aber..."
6. Unterschiedliche Sprechstile oder Fachbegriffe

Für jeden erkannten Sprecherwechsel gib an:
- Position im Text (ungefähre Wortnummer)
- Ob ein Name genannt wurde (bevorzuge bekannte Teilnehmer)
- Konfidenz (0.0 - 1.0)
- Kurze Begründung

Antworte NUR mit einem JSON-Array im folgenden Format:
[
  {
    "position": 0,
    "speakerName": "Name oder null wenn unbekannt",
    "confidence": 0.8,
    "reason": "Kurze Begründung"
  }
]

Regeln:
- Position 0 ist immer der erste Sprecher
- Setze speakerName nur wenn ein Name explizit genannt oder stark vermutet wird
- Bevorzuge bekannte Teilnehmer bei der Namenszuordnung
- Sei konservativ - nur klare Sprecherwechsel markieren
- Wenn keine Wechsel erkennbar sind, gib nur Position 0 zurück
- Keine zusätzlichen Erklärungen, nur das JSON-Array

Transkript:
`;
}

function getModel(settings: Settings) {
  const { selectedProvider, selectedModel, openaiApiKey, anthropicApiKey, ollamaBaseUrl } = settings;

  switch (selectedProvider) {
    case 'openai': {
      if (!openaiApiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey: openaiApiKey });
      return openai(selectedModel || 'gpt-4o');
    }
    case 'anthropic': {
      if (!anthropicApiKey) throw new Error('Anthropic API key is required');
      const anthropic = createAnthropic({ apiKey: anthropicApiKey });
      return anthropic(selectedModel || 'claude-sonnet-4-20250514');
    }
    case 'ollama': {
      const openai = createOpenAI({
        baseURL: `${ollamaBaseUrl}/v1`,
        apiKey: 'ollama',
      });
      return openai(selectedModel || 'llama3.2');
    }
    default:
      throw new Error(`Unknown provider: ${selectedProvider}`);
  }
}

interface DetectedSpeakerChange {
  position: number;
  speakerName: string | null;
  confidence: number;
  reason: string;
}

// Detect speaker changes in a transcript segment using AI
export async function detectSpeakerChanges(
  text: string,
  settings: Settings,
  participantNames?: string[]
): Promise<DetectedSpeakerChange[]> {
  if (!text.trim()) {
    return [{ position: 0, speakerName: null, confidence: 0.5, reason: 'Empty text' }];
  }

  const model = getModel(settings);
  const basePrompt = buildSpeakerDetectionPrompt(participantNames);
  const prompt = basePrompt + text;

  const { textStream } = streamText({
    model,
    prompt,
  });

  const fullText = await processStreamWithTimeout(
    textStream,
    undefined,
    300000 // 5 minutes timeout
  );

  return parseDetectionResponse(fullText);
}

// Parse AI response
function parseDetectionResponse(response: string): DetectedSpeakerChange[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in speaker detection response');
      return [{ position: 0, speakerName: null, confidence: 0.5, reason: 'Parse error' }];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      return [{ position: 0, speakerName: null, confidence: 0.5, reason: 'Invalid response' }];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        position: typeof item.position === 'number' ? item.position : 0,
        speakerName: typeof item.speakerName === 'string' ? item.speakerName : null,
        confidence: typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 0.5,
        reason: typeof item.reason === 'string' ? item.reason : '',
      }));
  } catch (err) {
    console.error('Failed to parse speaker detection response:', err);
    return [{ position: 0, speakerName: null, confidence: 0.5, reason: 'Parse error' }];
  }
}

// Split text into segments based on detected speaker changes
export function splitTextByChanges(
  text: string,
  changes: DetectedSpeakerChange[]
): { text: string; speakerName: string | null; confidence: number }[] {
  if (changes.length === 0) {
    return [{ text, speakerName: null, confidence: 0.5 }];
  }

  // Sort changes by position
  const sortedChanges = [...changes].sort((a, b) => a.position - b.position);

  // Split text into words
  const words = text.split(/\s+/);
  const segments: { text: string; speakerName: string | null; confidence: number }[] = [];

  let currentStart = 0;

  for (let i = 0; i < sortedChanges.length; i++) {
    const change = sortedChanges[i];
    const nextChange = sortedChanges[i + 1];
    const endPosition = nextChange ? nextChange.position : words.length;

    // Get words for this segment
    const segmentWords = words.slice(
      Math.max(0, change.position),
      Math.min(words.length, endPosition)
    );

    if (segmentWords.length > 0) {
      segments.push({
        text: segmentWords.join(' '),
        speakerName: change.speakerName,
        confidence: change.confidence,
      });
    }
  }

  // If no segments were created, return the full text
  if (segments.length === 0) {
    return [{ text, speakerName: null, confidence: 0.5 }];
  }

  return segments;
}

// Quick heuristic detection (no AI, for real-time hints)
export function quickDetectSpeakerHints(text: string): string[] {
  const hints: string[] = [];

  // Common patterns that suggest speaker identification
  const patterns = [
    // Direct address patterns (German)
    /(?:^|\s)([A-Z][a-zäöüß]+)(?:,|\s+(?:was|wie|kannst|könntest|hast|bist|meinst))/g,
    // "Ja/Nein, [Name]" patterns
    /(?:ja|nein|okay|gut|richtig|genau),?\s+([A-Z][a-zäöüß]+)/gi,
    // "[Name] sagt/meint/denkt" patterns
    /([A-Z][a-zäöüß]+)\s+(?:sagt|meint|denkt|fragt|antwortet)/g,
    // "laut [Name]" patterns
    /laut\s+([A-Z][a-zäöüß]+)/gi,
    // "@[Name]" mentions
    /@([A-Za-zäöüß]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      // Filter out common words that look like names
      const excludeWords = ['Ja', 'Nein', 'Okay', 'Gut', 'Also', 'Aber', 'Und', 'Oder', 'Wenn', 'Dann'];
      if (name && name.length > 2 && !excludeWords.includes(name)) {
        hints.push(name);
      }
    }
  }

  // Remove duplicates and return
  return [...new Set(hints)];
}

// Estimate speaker count from text
export function estimateSpeakerCount(text: string): number {
  // Count question-answer patterns
  const questionMarks = (text.match(/\?/g) || []).length;

  // Count response indicators
  const responses = (text.match(/(?:ja|nein|genau|richtig|okay|stimmt|absolut)[,.\s]/gi) || []).length;

  // Count "I" vs "we" usage changes
  const iCount = (text.match(/\bich\b/gi) || []).length;
  const weCount = (text.match(/\bwir\b/gi) || []).length;

  // Heuristic: more questions + responses = more speakers
  const interactionScore = questionMarks + responses;

  if (interactionScore === 0) return 1;
  if (interactionScore <= 2) return 2;
  if (interactionScore <= 5) return 3;
  return Math.min(6, Math.floor(interactionScore / 2));
}
