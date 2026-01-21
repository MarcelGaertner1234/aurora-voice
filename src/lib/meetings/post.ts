// Post-Meeting Processing for Aurora Meeting Assistant
// Handles summary generation, decision extraction, and follow-up

import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { v4 as uuidv4 } from 'uuid';
import type { Settings, ProjectContext } from '@/types';
import { processStreamWithTimeout } from '@/lib/ai/stream-utils';
import { splitTranscriptIntoChunks, CHUNK_SIZE } from '@/lib/ai/enrich';
import { findMatchingFiles, formatMatchesForPrompt } from '@/lib/project/matcher';
import type {
  Meeting,
  MeetingSummary,
  MeetingDecision,
  MeetingQuestion,
  Transcript,
  DecisionStatus,
  QuestionExtractionType,
} from '@/types/meeting';
import type { Task, ExtractedTask } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';

function getModel(settings: Settings) {
  const { selectedProvider, selectedModel, openaiApiKey, anthropicApiKey, ollamaBaseUrl } = settings;

  switch (selectedProvider) {
    case 'openai': {
      if (!openaiApiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey: openaiApiKey });
      // Use .chat() to force /v1/chat/completions instead of /v1/responses
      return openai.chat(selectedModel || 'gpt-4o');
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

// Enhanced summary prompt
const ENHANCED_SUMMARY_PROMPT = `Du bist ein Experte für Meeting-Zusammenfassungen. Analysiere das Transkript und erstelle eine umfassende Zusammenfassung.

Meeting-Titel: {title}
Teilnehmer: {participants}
Dauer: {duration}

Transkript:
{transcript}

Erstelle eine strukturierte Zusammenfassung mit INTELLIGENTER EXTRAKTION:

**Entscheidungen - extrahiere BEIDE Arten:**
1. Getroffene Entscheidungen (status: "decided")
2. AUSSTEHENDE Entscheidungen (status: "pending") - z.B. "Lieferantenauswahl", "Preisvergleich", "Budget klären"

**Offene Fragen - extrahiere BEIDE Arten:**
1. Explizite Fragen (type: "explicit") - direkt gestellt
2. IMPLIZITE Fragen (type: "implicit") - fehlende Infos wie "Wieviel KG?", "Welcher Lieferant?", "Was kostet es?"

JSON-Format:
{
  "overview": "2-3 Sätze Überblick über das Meeting",
  "keyPoints": ["Punkt 1", "Punkt 2", "Punkt 3"],
  "decisions": [
    {
      "text": "Entscheidung oder ausstehende Entscheidung",
      "context": "Kurzer Kontext",
      "participants": ["Name1", "Name2"],
      "status": "decided" | "pending",
      "suggestedAction": "Nächste Schritte (bei pending)",
      "assigneeName": "Name der verantwortlichen Person oder null"
    }
  ],
  "openQuestions": [
    {
      "text": "Offene Frage (explizit oder implizit)",
      "askedBy": "Name oder null",
      "type": "explicit" | "implicit",
      "context": "Warum wichtig / was fehlt",
      "assigneeName": "Name der Person die antworten/klären soll oder null"
    }
  ],
  "nextSteps": ["Nächster Schritt 1", "Nächster Schritt 2"],
  "highlights": ["Besonders wichtiger Punkt"],
  "concerns": ["Bedenken oder Risiken falls erwähnt"]
}

Regeln:
- Bei Bestellungen/Listen: Prüfe auf fehlende Angaben (Menge, Einheit, Lieferant, Preis, Deadline)
- Fehlende Angaben → implizite Fragen UND pending Entscheidungen erstellen
- Sei gründlich bei der Extraktion von impliziten Informationen
- Keine erfundenen Informationen
- assigneeName: Wenn eine Person explizit genannt wird die etwas tun/klären/entscheiden soll, setze ihren Namen als assigneeName

Antworte NUR mit dem JSON-Objekt.`;

// Project context section for summary
const PROJECT_CONTEXT_SECTION = `

**Projekt-Struktur (falls erwähnt):**
{projectFiles}

Erkannte Datei-Referenzen:
{fileMatches}

Verknüpfe erwähnte Dateien/Komponenten mit den echten Pfaden im Projekt.
`;

// Decision extraction prompt
const DECISION_EXTRACTION_PROMPT = `Analysiere das Meeting-Transkript und extrahiere Entscheidungen:

Transkript:
{transcript}

**1. Getroffene Entscheidungen (status: decided):**
- Explizite Entscheidungen ("Wir haben entschieden...", "Es wurde beschlossen...")
- Vereinbarungen ("Wir sind uns einig...", "Abgemacht...")
- Festlegungen ("Das machen wir so...", "Der Plan ist...")
- Zustimmungen zu Vorschlägen ("Ja, das machen wir", "Einverstanden")

**2. AUSSTEHENDE Entscheidungen (status: pending) - WICHTIG!:**
Erkenne wo Entscheidungen noch getroffen werden müssen:

- Bestellungen ohne Lieferant: → "Lieferantenauswahl treffen"
- Mehrere Optionen erwähnt: → "Zwischen Option A und B entscheiden"
- Preisrelevant ohne Festlegung: → "Preisvergleich durchführen und Budget festlegen"
- Qualitätsfragen offen: → "Qualitätsstufe/Sorte festlegen"
- Ressourcenfragen: → "Budget/Kapazität klären"
- Terminplanung offen: → "Termin/Deadline festlegen"
- Verantwortlichkeiten unklar: → "Zuständigkeiten klären"

Antworte mit JSON-Array:
[
  {
    "text": "Die Entscheidung",
    "status": "decided" | "pending",
    "context": "Kontext oder Begründung",
    "participants": ["Beteiligte Namen falls genannt"],
    "suggestedAction": "Empfohlene nächste Schritte (nur bei pending)",
    "assigneeName": "Name der verantwortlichen Person oder null"
  }
]

Regeln:
- Bei Bestellungen/Listen ohne expliziten Lieferanten → pending "Lieferantenauswahl"
- Bei Produkten ohne Preisangabe → pending "Preisvergleich/Budget klären"
- Jede implizite Entscheidung braucht eine suggestedAction
- assigneeName: Wenn jemand explizit für die Entscheidung verantwortlich ist, setze den Namen`;

// Question extraction prompt
const QUESTION_EXTRACTION_PROMPT = `Analysiere das Meeting-Transkript und extrahiere offene Fragen:

Transkript:
{transcript}

**1. Explizite offene Fragen:**
- Direkte Fragen die nicht beantwortet wurden
- "Noch zu klären", "Später besprechen"
- Unsicherheiten ("Wir müssen noch herausfinden...")

**2. IMPLIZITE offene Fragen (WICHTIG!):**
Erkenne fehlende Informationen und formuliere sie als Fragen:

- Mengenangaben ohne Einheit: "12 Stück Rinderfilet" → "Wieviel KG/Gramm pro Stück?"
- Produkte ohne Lieferant: → "Von welchem Lieferanten bestellen?"
- Preise nicht genannt: → "Was kostet das? Wie hoch ist das Budget?"
- Qualität nicht spezifiziert: → "Welche Qualität/Sorte?"
- Termine ungenau: → "Wann genau? Bis wann wird es benötigt?"
- Verantwortliche unklar: → "Wer ist verantwortlich?"
- Mengen unklar: → "Wie viel genau wird benötigt?"
- Lieferdetails fehlen: → "Wohin soll geliefert werden?"

Antworte mit JSON-Array:
[
  {
    "text": "Die Frage (klar und spezifisch formuliert)",
    "askedBy": "Name oder null",
    "type": "explicit" | "implicit",
    "context": "Warum diese Frage wichtig ist / was fehlt",
    "assigneeName": "Name der Person die antworten/klären soll oder null"
  }
]

Regeln:
- Bei Bestellungen/Listen: Prüfe ob Menge, Einheit, Lieferant, Preis, Deadline genannt wurden
- Fehlende Angaben → implizite Fragen erstellen
- Auch scheinbar vollständige Angaben hinterfragen wenn unklar
- assigneeName: Wenn jemand explizit die Frage beantworten soll, setze den Namen`;

// Merge multiple partial summaries into one
function mergePartialSummaries(summaries: MeetingSummary[]): MeetingSummary {
  if (summaries.length === 0) {
    return {
      overview: '',
      keyPoints: [],
      decisions: [],
      openQuestions: [],
      generatedAt: new Date(),
    };
  }

  if (summaries.length === 1) {
    return summaries[0];
  }

  // Combine overviews
  const combinedOverview = summaries
    .map((s) => s.overview)
    .filter(Boolean)
    .join(' ');

  // Merge key points with deduplication
  const allKeyPoints = summaries.flatMap((s) => s.keyPoints);
  const uniqueKeyPoints = [...new Set(allKeyPoints)];

  // Merge decisions with deduplication by text prefix
  const seenDecisionPrefixes = new Set<string>();
  const mergedDecisions: MeetingDecision[] = [];
  for (const summary of summaries) {
    for (const decision of summary.decisions) {
      const prefix = decision.text.toLowerCase().slice(0, 30);
      if (!seenDecisionPrefixes.has(prefix)) {
        seenDecisionPrefixes.add(prefix);
        mergedDecisions.push(decision);
      }
    }
  }

  // Merge questions with deduplication by text prefix
  const seenQuestionPrefixes = new Set<string>();
  const mergedQuestions: MeetingQuestion[] = [];
  for (const summary of summaries) {
    for (const question of summary.openQuestions) {
      const prefix = question.text.toLowerCase().slice(0, 30);
      if (!seenQuestionPrefixes.has(prefix)) {
        seenQuestionPrefixes.add(prefix);
        mergedQuestions.push(question);
      }
    }
  }

  return {
    overview: combinedOverview,
    keyPoints: uniqueKeyPoints,
    decisions: mergedDecisions,
    openQuestions: mergedQuestions,
    generatedAt: new Date(),
  };
}

// Generate enhanced summary
export async function generateEnhancedSummary(
  meeting: Meeting,
  speakers: SpeakerProfile[],
  settings: Settings,
  onProgress?: (progress: string) => void,
  projectContext?: ProjectContext | null
): Promise<MeetingSummary> {
  if (!meeting.transcript) {
    throw new Error('No transcript available');
  }

  const model = getModel(settings);
  const transcriptText = meeting.transcript.fullText;
  const transcriptSize = new Blob([transcriptText]).size;

  // Get participant names
  const participantNames = speakers
    .filter((s) => meeting.participantIds.includes(s.id))
    .map((s) => s.name)
    .join(', ') || 'Nicht angegeben';

  // Calculate duration
  const durationMin = Math.round(meeting.transcript.duration / 60000);

  // Build project context section if available
  let projectContextSection = '';
  if (projectContext && projectContext.files.length > 0) {
    const matches = findMatchingFiles(transcriptText, projectContext, {
      minRelevance: 0.5,
      maxResults: 10,
    });

    const relevantFiles = projectContext.files
      .filter((f) => f.type === 'code')
      .slice(0, 30)
      .map((f) => `- ${f.path}`)
      .join('\n');

    const matchesText = matches.length > 0
      ? formatMatchesForPrompt(matches)
      : 'Keine direkten Datei-Referenzen erkannt';

    projectContextSection = PROJECT_CONTEXT_SECTION
      .replace('{projectFiles}', relevantFiles || 'Keine Dateien indexiert')
      .replace('{fileMatches}', matchesText);
  }

  // Check if chunking is needed
  if (transcriptSize <= CHUNK_SIZE) {
    // Small transcript - process normally
    onProgress?.('Generiere Zusammenfassung...');

    const prompt = ENHANCED_SUMMARY_PROMPT
      .replace('{title}', meeting.title)
      .replace('{participants}', participantNames)
      .replace('{duration}', `${durationMin} Minuten`)
      .replace('{transcript}', transcriptText) + projectContextSection;

    const { textStream } = streamText({
      model,
      prompt,
    });

    const fullText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000 // 5 minutes timeout
    );

    return parseEnhancedSummary(fullText);
  }

  // Large transcript - use chunking
  console.log(`Summary: Transcript size ${(transcriptSize / 1024).toFixed(0)} KB - using chunking`);
  const chunks = splitTranscriptIntoChunks(transcriptText, CHUNK_SIZE);
  console.log(`Summary: Split into ${chunks.length} chunks`);

  const partialSummaries: MeetingSummary[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Generiere Zusammenfassung (Teil ${i + 1}/${chunks.length})...`);
    console.log(`Summary: Processing chunk ${i + 1}/${chunks.length}`);

    const chunkPrompt = ENHANCED_SUMMARY_PROMPT
      .replace('{title}', `${meeting.title} (Teil ${i + 1}/${chunks.length})`)
      .replace('{participants}', participantNames)
      .replace('{duration}', `${durationMin} Minuten`)
      .replace('{transcript}', chunks[i]) + projectContextSection;

    const { textStream } = streamText({
      model,
      prompt: chunkPrompt,
    });

    const chunkText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000
    );

    const partialSummary = parseEnhancedSummary(chunkText);
    partialSummaries.push(partialSummary);
  }

  // Merge all partial summaries
  onProgress?.('Kombiniere Ergebnisse...');
  return mergePartialSummaries(partialSummaries);
}

// Helper to validate decision status in summary parsing
function validateSummaryDecisionStatus(status: unknown): DecisionStatus {
  const validStatuses: DecisionStatus[] = ['decided', 'pending'];
  if (typeof status === 'string' && validStatuses.includes(status as DecisionStatus)) {
    return status as DecisionStatus;
  }
  return 'decided';
}

// Helper to validate question type in summary parsing
function validateSummaryQuestionType(type: unknown): QuestionExtractionType {
  const validTypes: QuestionExtractionType[] = ['explicit', 'implicit'];
  if (typeof type === 'string' && validTypes.includes(type as QuestionExtractionType)) {
    return type as QuestionExtractionType;
  }
  return 'explicit';
}

// Fix: Helper function to extract valid JSON object from response
function extractJsonObject(response: string): string | null {
  // Find the first { and last } to extract JSON more reliably
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return response.slice(firstBrace, lastBrace + 1);
}

// Parse enhanced summary response
function parseEnhancedSummary(response: string): MeetingSummary {
  try {
    const jsonStr = extractJsonObject(response);
    if (!jsonStr) {
      console.error('No JSON object found in summary response');
      throw new Error('No JSON object found');
    }

    const parsed = JSON.parse(jsonStr);

    return {
      overview: String(parsed.overview || ''),
      keyPoints: Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.map(String)
        : [],
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.map((d: Record<string, unknown>) => ({
            id: uuidv4(),
            text: String(d.text || ''),
            context: d.context ? String(d.context) : undefined,
            timestamp: Date.now(),
            participants: Array.isArray(d.participants)
              ? d.participants.map(String)
              : [],
            status: validateSummaryDecisionStatus(d.status),
            suggestedAction: d.suggestedAction ? String(d.suggestedAction) : undefined,
            assigneeName: d.assigneeName ? String(d.assigneeName) : undefined,
          }))
        : [],
      openQuestions: Array.isArray(parsed.openQuestions)
        ? parsed.openQuestions.map((q: Record<string, unknown>) => ({
            id: uuidv4(),
            text: String(q.text || ''),
            askedBy: q.askedBy ? String(q.askedBy) : undefined,
            answered: false,
            timestamp: Date.now(),
            type: validateSummaryQuestionType(q.type),
            context: q.context ? String(q.context) : undefined,
            assigneeName: q.assigneeName ? String(q.assigneeName) : undefined,
          }))
        : [],
      generatedAt: new Date(),
    };
  } catch (err) {
    console.error('Failed to parse enhanced summary:', err);
    return {
      overview: '',
      keyPoints: [],
      decisions: [],
      openQuestions: [],
      generatedAt: new Date(),
    };
  }
}

// Extract decisions from transcript
export async function extractDecisions(
  transcript: Transcript,
  settings: Settings
): Promise<MeetingDecision[]> {
  const model = getModel(settings);
  const transcriptText = transcript.fullText;
  const transcriptSize = new Blob([transcriptText]).size;

  // Check if chunking is needed
  if (transcriptSize <= CHUNK_SIZE) {
    // Small transcript - process normally
    const prompt = DECISION_EXTRACTION_PROMPT.replace('{transcript}', transcriptText);

    const { textStream } = streamText({
      model,
      prompt,
    });

    const fullText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000 // 5 minutes timeout
    );

    return parseDecisions(fullText);
  }

  // Large transcript - use chunking
  console.log(`Decisions: Transcript size ${(transcriptSize / 1024).toFixed(0)} KB - using chunking`);
  const chunks = splitTranscriptIntoChunks(transcriptText, CHUNK_SIZE);
  console.log(`Decisions: Split into ${chunks.length} chunks`);

  const allDecisions: MeetingDecision[] = [];
  const seenPrefixes = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Decisions: Processing chunk ${i + 1}/${chunks.length}`);

    const chunkPrompt = DECISION_EXTRACTION_PROMPT.replace('{transcript}', chunks[i]);

    const { textStream } = streamText({
      model,
      prompt: chunkPrompt,
    });

    const chunkText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000
    );

    const chunkDecisions = parseDecisions(chunkText);

    // Deduplicate by text prefix
    for (const decision of chunkDecisions) {
      const prefix = decision.text.toLowerCase().slice(0, 30);
      if (!seenPrefixes.has(prefix)) {
        seenPrefixes.add(prefix);
        allDecisions.push(decision);
      }
    }
  }

  return allDecisions;
}

// Validate decision status
function validateDecisionStatus(status: unknown): DecisionStatus {
  const validStatuses: DecisionStatus[] = ['decided', 'pending'];
  if (typeof status === 'string' && validStatuses.includes(status as DecisionStatus)) {
    return status as DecisionStatus;
  }
  return 'decided';
}

// Parse decisions response
function parseDecisions(response: string): MeetingDecision[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        id: uuidv4(),
        text: String(item.text || ''),
        context: item.context ? String(item.context) : undefined,
        timestamp: Date.now(),
        participants: Array.isArray(item.participants)
          ? item.participants.map(String)
          : [],
        status: validateDecisionStatus(item.status),
        suggestedAction: item.suggestedAction ? String(item.suggestedAction) : undefined,
        assigneeName: item.assigneeName ? String(item.assigneeName) : undefined,
      }));
  } catch (err) {
    console.error('Failed to parse decisions:', err);
    return [];
  }
}

// Extract open questions from transcript
export async function extractQuestions(
  transcript: Transcript,
  settings: Settings
): Promise<MeetingQuestion[]> {
  const model = getModel(settings);
  const transcriptText = transcript.fullText;
  const transcriptSize = new Blob([transcriptText]).size;

  // Check if chunking is needed
  if (transcriptSize <= CHUNK_SIZE) {
    // Small transcript - process normally
    const prompt = QUESTION_EXTRACTION_PROMPT.replace('{transcript}', transcriptText);

    const { textStream } = streamText({
      model,
      prompt,
    });

    const fullText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000 // 5 minutes timeout
    );

    return parseQuestions(fullText);
  }

  // Large transcript - use chunking
  console.log(`Questions: Transcript size ${(transcriptSize / 1024).toFixed(0)} KB - using chunking`);
  const chunks = splitTranscriptIntoChunks(transcriptText, CHUNK_SIZE);
  console.log(`Questions: Split into ${chunks.length} chunks`);

  const allQuestions: MeetingQuestion[] = [];
  const seenPrefixes = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Questions: Processing chunk ${i + 1}/${chunks.length}`);

    const chunkPrompt = QUESTION_EXTRACTION_PROMPT.replace('{transcript}', chunks[i]);

    const { textStream } = streamText({
      model,
      prompt: chunkPrompt,
    });

    const chunkText = await processStreamWithTimeout(
      textStream,
      undefined,
      300000
    );

    const chunkQuestions = parseQuestions(chunkText);

    // Deduplicate by text prefix
    for (const question of chunkQuestions) {
      const prefix = question.text.toLowerCase().slice(0, 30);
      if (!seenPrefixes.has(prefix)) {
        seenPrefixes.add(prefix);
        allQuestions.push(question);
      }
    }
  }

  return allQuestions;
}

// Validate question extraction type
function validateQuestionType(type: unknown): QuestionExtractionType {
  const validTypes: QuestionExtractionType[] = ['explicit', 'implicit'];
  if (typeof type === 'string' && validTypes.includes(type as QuestionExtractionType)) {
    return type as QuestionExtractionType;
  }
  return 'explicit';
}

// Parse questions response
function parseQuestions(response: string): MeetingQuestion[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        id: uuidv4(),
        text: String(item.text || ''),
        askedBy: item.askedBy ? String(item.askedBy) : undefined,
        answered: false,
        timestamp: Date.now(),
        type: validateQuestionType(item.type),
        context: item.context ? String(item.context) : undefined,
        assigneeName: item.assigneeName ? String(item.assigneeName) : undefined,
      }));
  } catch (err) {
    console.error('Failed to parse questions:', err);
    return [];
  }
}

// Full post-meeting processing
export interface PostMeetingResult {
  summary: MeetingSummary;
  tasks: ExtractedTask[];
  processingTime: number;
}

export async function processPostMeeting(
  meeting: Meeting,
  speakers: SpeakerProfile[],
  settings: Settings,
  onProgress?: (stage: string, progress: number) => void,
  projectContext?: ProjectContext | null
): Promise<PostMeetingResult> {
  const startTime = Date.now();

  if (!meeting.transcript) {
    throw new Error('No transcript available for post-processing');
  }

  // Debug: Log transcript size
  const transcriptSize = new Blob([meeting.transcript.fullText]).size;
  console.log(`Post-Meeting: Transcript size = ${(transcriptSize / 1024).toFixed(0)} KB`);
  if (transcriptSize > 1024 * 1024) {
    console.warn(`WARNING: Transcript is ${(transcriptSize / 1024 / 1024).toFixed(2)} MB - unusually large!`);
  }

  // Stage 1: Generate summary (with project context if available)
  onProgress?.('Generiere Zusammenfassung...', 0.2);
  const summary = await generateEnhancedSummary(meeting, speakers, settings, undefined, projectContext);

  // Stage 2: Extract additional decisions (if not enough in summary)
  onProgress?.('Extrahiere Entscheidungen...', 0.5);
  if (summary.decisions.length < 2) {
    const additionalDecisions = await extractDecisions(meeting.transcript, settings);
    // Merge, avoiding duplicates - use Set for O(1) lookups instead of O(n) .some()
    const existingPrefixes = new Set(
      summary.decisions.map((d) => d.text.toLowerCase().slice(0, 20))
    );
    for (const decision of additionalDecisions) {
      const prefix = decision.text.toLowerCase().slice(0, 20);
      if (!existingPrefixes.has(prefix)) {
        existingPrefixes.add(prefix);
        summary.decisions.push(decision);
      }
    }
  }

  // Stage 3: Extract additional questions (if not enough in summary)
  onProgress?.('Sammle offene Fragen...', 0.7);
  if (summary.openQuestions.length < 2) {
    const additionalQuestions = await extractQuestions(meeting.transcript, settings);
    // Merge, avoiding duplicates - use Set for O(1) lookups instead of O(n) .some()
    const existingPrefixes = new Set(
      summary.openQuestions.map((q) => q.text.toLowerCase().slice(0, 20))
    );
    for (const question of additionalQuestions) {
      const prefix = question.text.toLowerCase().slice(0, 20);
      if (!existingPrefixes.has(prefix)) {
        existingPrefixes.add(prefix);
        summary.openQuestions.push(question);
      }
    }
  }

  // Stage 4: Extract tasks (with project context if available)
  onProgress?.('Extrahiere Aufgaben...', 0.9);
  const { extractTasksFromTranscript } = await import('@/lib/tasks/extractor');
  const { tasks } = await extractTasksFromTranscript(meeting.transcript.fullText, settings, projectContext);

  onProgress?.('Fertig!', 1.0);

  return {
    summary,
    tasks,
    processingTime: Date.now() - startTime,
  };
}

// Generate follow-up email draft
export async function generateFollowUpEmail(
  meeting: Meeting,
  tasks: Task[],
  speakers: SpeakerProfile[],
  settings: Settings
): Promise<string> {
  if (!meeting.summary) {
    throw new Error('Meeting summary required for follow-up email');
  }

  const model = getModel(settings);

  const participantNames = speakers
    .filter((s) => meeting.participantIds.includes(s.id))
    .map((s) => s.name)
    .join(', ');

  const taskList = tasks
    .map((t) => `- ${t.title}${t.assigneeName ? ` (@${t.assigneeName})` : ''}`)
    .join('\n');

  const decisionList = meeting.summary.decisions
    .map((d) => `- ${d.text}`)
    .join('\n');

  const prompt = `Erstelle eine professionelle Follow-Up E-Mail für das folgende Meeting:

Meeting: ${meeting.title}
Datum: ${meeting.createdAt.toLocaleDateString('de-DE')}
Teilnehmer: ${participantNames}

Zusammenfassung:
${meeting.summary.overview}

Wichtige Punkte:
${meeting.summary.keyPoints.map((p) => `- ${p}`).join('\n')}

Entscheidungen:
${decisionList || 'Keine expliziten Entscheidungen'}

Aufgaben:
${taskList || 'Keine Aufgaben'}

Offene Fragen:
${meeting.summary.openQuestions.map((q) => `- ${q.text}`).join('\n') || 'Keine offenen Fragen'}

Erstelle eine kurze, professionelle E-Mail auf Deutsch mit:
1. Betreff
2. Anrede
3. Kurze Zusammenfassung
4. Aufgabenliste mit Verantwortlichen
5. Nächste Schritte
6. Grußformel

Formatiere die E-Mail direkt ohne zusätzliche Erklärungen.`;

  const { textStream } = streamText({
    model,
    prompt,
  });

  const fullText = await processStreamWithTimeout(
    textStream,
    undefined,
    300000 // 5 minutes timeout
  );

  return fullText;
}

// Calculate meeting metrics
export interface MeetingMetrics {
  totalDuration: number; // ms
  speakingTimeByParticipant: Map<string, number>;
  topicsCovered: number;
  decisionsCount: number;
  tasksCreated: number;
  questionsRaised: number;
  questionsAnswered: number;
  engagementScore: number; // 0-100
}

export function calculateMeetingMetrics(
  meeting: Meeting,
  tasks: Task[]
): MeetingMetrics {
  const duration = meeting.transcript?.duration || 0;

  // Calculate speaking time per participant
  const speakingTime = new Map<string, number>();
  if (meeting.transcript) {
    for (const segment of meeting.transcript.segments) {
      if (segment.speakerId) {
        const current = speakingTime.get(segment.speakerId) || 0;
        speakingTime.set(segment.speakerId, current + (segment.endTime - segment.startTime));
      }
    }
  }

  // Count metrics
  const decisionsCount = meeting.summary?.decisions.length || 0;
  const questionsRaised = meeting.summary?.openQuestions.length || 0;
  const questionsAnswered = meeting.summary?.openQuestions.filter((q) => q.answered).length || 0;
  const topicsCovered = meeting.agenda.filter((a) => a.completed).length;

  // Calculate engagement score (heuristic)
  let engagementScore = 50; // Base score

  // More decisions = more engagement
  engagementScore += Math.min(decisionsCount * 5, 20);

  // More tasks = more actionable
  engagementScore += Math.min(tasks.length * 3, 15);

  // Completed agenda items
  if (meeting.agenda.length > 0) {
    engagementScore += (topicsCovered / meeting.agenda.length) * 15;
  }

  // Speaker diversity
  if (speakingTime.size > 1) {
    engagementScore += Math.min(speakingTime.size * 3, 10);
  }

  return {
    totalDuration: duration,
    speakingTimeByParticipant: speakingTime,
    topicsCovered,
    decisionsCount,
    tasksCreated: tasks.length,
    questionsRaised,
    questionsAnswered,
    engagementScore: Math.min(100, Math.round(engagementScore)),
  };
}
