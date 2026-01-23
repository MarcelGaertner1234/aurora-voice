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

// Semantic keyword clusters for task deduplication
// Tasks containing keywords from the same cluster are considered duplicates
const TASK_DEDUP_KEYWORD_CLUSTERS = [
  ['arbeitsgruppe', 'bildung', 'einrichten', 'einrichtung', 'gründen', 'gründung'],
  ['pilotprojekt', 'pilot', 'testphase', 'evaluieren', 'testen', 'pilotphase'],
  ['schulung', 'training', 'fortbildung', 'qualifizierung', 'führungskräfte schulen', 'weiterbildung'],
  ['zeiterfassung', 'arbeitszeit', 'erfassung', 'dokumentation', 'stundenerfassung'],
  ['richtlinien', 'regelwerk', 'guidelines', 'kommunikationsregeln', 'leitfaden', 'policy'],
  ['feedback', 'rückmeldung', 'evaluation', 'bewertung', 'umfrage'],
  ['kommunikation', 'informieren', 'bekanntgeben', 'mitteilen', 'kommunizieren'],
];

/**
 * Deduplicate tasks semantically using keyword clusters
 * Tasks matching the same keyword cluster are considered duplicates - only the first is kept
 */
function deduplicateTasksSemantically(tasks: ExtractedTask[]): ExtractedTask[] {
  const seen = new Map<number, ExtractedTask>();
  const nonClusteredTasks: ExtractedTask[] = [];

  for (const task of tasks) {
    const titleLower = task.title.toLowerCase();
    let matchedClusterIndex = -1;

    // Find matching keyword cluster
    for (let i = 0; i < TASK_DEDUP_KEYWORD_CLUSTERS.length; i++) {
      if (TASK_DEDUP_KEYWORD_CLUSTERS[i].some(kw => titleLower.includes(kw))) {
        matchedClusterIndex = i;
        break;
      }
    }

    if (matchedClusterIndex === -1) {
      // No cluster match - add to non-clustered list
      nonClusteredTasks.push(task);
    } else if (!seen.has(matchedClusterIndex)) {
      // First task in this cluster - keep it
      seen.set(matchedClusterIndex, task);
    }
    // Else: Duplicate in cluster - skip
  }

  // Combine clustered and non-clustered tasks
  return [...Array.from(seen.values()), ...nonClusteredTasks];
}

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

**WICHTIG für openQuestions:**
- NUR Fragen die im Transkript NICHT beantwortet wurden
- Wenn eine Frage gestellt und später beantwortet wird → NICHT als offen listen
- Prüfe das GESAMTE Transkript auf Antworten

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

**DEFINITION "BEANTWORTET" - WICHTIG:**
Eine Frage gilt als BEANTWORTET wenn im Transkript:
- Eine konkrete Lösung/Maßnahme genannt wurde
- Ein Beschluss gefasst wurde
- Ein Plan/Vorgehen definiert wurde
- Jemand die Verantwortung übernommen hat
- Konkrete Schritte zur Lösung besprochen wurden

**KRITISCHE BEISPIELE - Diese Fragen sind NICHT offen:**

❌ FALSCH: "Wie stellen wir Einhaltung des Arbeitszeitgesetzes sicher?"
Wenn im Transkript steht: "Juristische Prüfung bereits initiiert", "Moderne Zeiterfassungssysteme"
→ NICHT offen - konkrete Maßnahmen wurden genannt (juristische Prüfung + Zeiterfassung)

❌ FALSCH: "Wie sichern wir Teamkohäsion/soziale Interaktionen?"
Wenn im Transkript steht: "Anker-Tage definieren", "Verpflichtende Teamtage"
→ NICHT offen - Lösungsansätze wurden besprochen (Anker-Tage, Teamtage)

❌ FALSCH: "Wer übernimmt die Kosten?"
Wenn im Transkript steht: "Das Unternehmen stellt Laptop und zahlt Zulage"
→ NICHT offen - wurde beantwortet

✅ RICHTIG (Frage bleibt offen):
Transkript: "Wann genau starten wir?" [keine Antwort, kein Zeitplan, keine Festlegung]
→ Offene Frage: "Wann genau starten wir?"

**PRÜF-SCHEMA für jede potentielle offene Frage:**
1. Wurde ein konkreter Lösungsansatz genannt? → Nicht offen
2. Wurde eine Maßnahme beschlossen? → Nicht offen
3. Wurde ein Verantwortlicher benannt? → Nicht offen
4. Wurde ein Zeitplan/Prozess definiert? → Nicht offen
5. NUR wenn NICHTS davon zutrifft → Offene Frage

Transkript:
{transcript}

**1. Explizite offene Fragen:**
- Direkte Fragen die NICHT beantwortet wurden
- "Noch zu klären", "Später besprechen"
- KEINE Fragen zu denen Maßnahmen besprochen wurden!

**2. IMPLIZITE offene Fragen:**
Erkenne fehlende Informationen die NICHT im Meeting geklärt wurden:
- Mengenangaben ohne Einheit
- Produkte ohne Lieferant
- Preise nicht genannt
- Termine ungenau
- Verantwortliche unklar

Antworte mit JSON-Array:
[
  {
    "text": "Die Frage (klar formuliert)",
    "askedBy": "Name oder null",
    "type": "explicit" | "implicit",
    "context": "Warum wichtig / was fehlt",
    "assigneeName": "Name der Person die antworten soll"
  }
]

Regeln:
- KRITISCH: Prüfe das GESAMTE Transkript auf Lösungsansätze, Maßnahmen, Beschlüsse
- Wenn konkrete Maßnahmen besprochen wurden → Frage ist BEANTWORTET
- Wenn Lösungsansätze genannt wurden → Frage ist BEANTWORTET
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

// Return type for enhanced summary including raw text for action items parsing
export interface EnhancedSummaryResult {
  summary: MeetingSummary;
  rawText: string; // Raw AI response for action items parsing
}

// Generate enhanced summary
export async function generateEnhancedSummary(
  meeting: Meeting,
  speakers: SpeakerProfile[],
  settings: Settings,
  onProgress?: (progress: string) => void,
  projectContext?: ProjectContext | null
): Promise<EnhancedSummaryResult> {
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

    return {
      summary: parseEnhancedSummary(fullText),
      rawText: fullText,
    };
  }

  // Large transcript - use chunking
  console.log(`Summary: Transcript size ${(transcriptSize / 1024).toFixed(0)} KB - using chunking`);
  const chunks = splitTranscriptIntoChunks(transcriptText, CHUNK_SIZE);
  console.log(`Summary: Split into ${chunks.length} chunks`);

  const partialSummaries: MeetingSummary[] = [];
  const rawTexts: string[] = [];

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
    rawTexts.push(chunkText);
  }

  // Merge all partial summaries
  onProgress?.('Kombiniere Ergebnisse...');
  return {
    summary: mergePartialSummaries(partialSummaries),
    rawText: rawTexts.join('\n\n'), // Combine all raw texts for action items parsing
  };
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
  console.log('[DEBUG] parseEnhancedSummary input:', response.substring(0, 500));

  try {
    const jsonStr = extractJsonObject(response);
    console.log('[DEBUG] extractJsonObject result:', jsonStr ? 'found' : 'NOT FOUND');

    if (!jsonStr) {
      console.error('No JSON object found in summary response');
      throw new Error('No JSON object found');
    }

    const parsed = JSON.parse(jsonStr);

    console.log('[DEBUG] parsed JSON:', {
      hasDecisions: Array.isArray(parsed.decisions),
      decisionsCount: Array.isArray(parsed.decisions) ? parsed.decisions.length : 0,
      hasOpenQuestions: Array.isArray(parsed.openQuestions),
      openQuestionsCount: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.length : 0,
      hasNextSteps: Array.isArray(parsed.nextSteps),
      nextStepsCount: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.length : 0,
    });

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
      // Parse nextSteps from AI response as actionItems
      actionItems: Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps.map((step: string) => ({
            id: uuidv4(),
            text: String(step),
            assigneeName: undefined,
            timestamp: Date.now(),
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

// Extract tasks from MeetingSummary decisions (pending decisions with suggestedAction become tasks)
function extractTasksFromSummaryDecisions(summary: MeetingSummary): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];

  for (const decision of summary.decisions) {
    // Pending decisions with suggestedAction are essentially tasks
    if (decision.status === 'pending' && decision.suggestedAction) {
      tasks.push({
        title: decision.suggestedAction,
        assigneeName: decision.assigneeName,
        priority: 'medium',
        sourceText: decision.text,
        confidence: 0.85,
        type: 'implicit', // Inferred from pending decision
      });
    }
  }

  // Also extract tasks from open questions that need action
  for (const question of summary.openQuestions) {
    // Questions with assignees are essentially tasks to answer/resolve
    if (question.assigneeName && question.type === 'implicit') {
      tasks.push({
        title: `Klären: ${question.text}`,
        assigneeName: question.assigneeName,
        priority: 'medium',
        sourceText: question.text,
        confidence: 0.75,
        type: 'implicit',
      });
    }
  }

  return tasks;
}

// Parse action items from generated summary text and convert to ExtractedTask[]
// This ensures tasks mentioned in the summary's "Action Items" section are captured
export function parseActionItemsFromSummary(summaryText: string): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const lines = summaryText.split('\n');
  let inActionItems = false;

  for (const line of lines) {
    // Check for action items section headers (German and English)
    if (
      line.includes('## Action Items') ||
      line.includes('## Aufgaben') ||
      line.includes('## Nächste Schritte') ||
      line.includes('## Next Steps')
    ) {
      inActionItems = true;
      continue;
    }

    // Exit when reaching next section
    if (line.startsWith('## ') && inActionItems) {
      break;
    }

    // Parse task lines (checkbox format or bullet points)
    if (inActionItems && (line.trim().startsWith('- [ ]') || line.trim().startsWith('- '))) {
      // Remove checkbox or bullet prefix
      let taskText = line.trim()
        .replace(/^- \[ \]/, '')
        .replace(/^- /, '')
        .trim();

      if (!taskText) continue;

      // Parse: "Task text (Verantwortlich: Name)" or "Task text (@Name)"
      // Also handles: "Task text (Assignee: Name)" for English
      const assigneeMatch = taskText.match(
        /(.+?)(?:\s*\((?:Verantwortlich|Assignee|Zuständig):\s*(.+?)\)|\s*\(@(.+?)\))?\s*$/i
      );

      if (assigneeMatch) {
        const title = assigneeMatch[1].trim();
        const assignee = (assigneeMatch[2] || assigneeMatch[3])?.trim();

        // Skip if title is too short or just punctuation
        if (title.length < 3) continue;

        tasks.push({
          title,
          assigneeName: assignee,
          priority: 'medium', // Default priority for action items
          sourceText: line.trim(),
          confidence: 0.9, // High confidence since it's from the structured summary
          type: 'explicit', // Explicitly mentioned in summary
        });
      }
    }
  }

  return tasks;
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
  const { summary, rawText } = await generateEnhancedSummary(meeting, speakers, settings, undefined, projectContext);

  console.log('[DEBUG] Stage 1 complete:', {
    hasActionItems: (summary.actionItems || []).length,
    rawTextLength: rawText.length
  });

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
  const { tasks: transcriptTasks } = await extractTasksFromTranscript(meeting.transcript.fullText, settings, projectContext);

  console.log('[DEBUG] Stage 4 complete:', {
    transcriptTasks: transcriptTasks.length
  });

  // Stage 5: Extract tasks from summary (pending decisions + open questions with assignees)
  // This ensures action items mentioned in the summary are captured as tasks
  const summaryTasks = extractTasksFromSummaryDecisions(summary);

  // Stage 6: Parse action items from raw AI response text
  // This captures action items that may be in markdown format in the AI response
  const actionItemTasks = parseActionItemsFromSummary(rawText);

  // Stage 7: Convert summary.actionItems (from parsed nextSteps) to ExtractedTask[]
  const summaryActionItemTasks: ExtractedTask[] = (summary.actionItems || []).map(item => ({
    title: item.text,
    assigneeName: item.assigneeName,
    priority: 'medium' as const,
    sourceText: item.text,
    confidence: 0.9,
    type: 'explicit' as const,
  }));

  // Combine tasks from transcript, summary decisions, and action items, deduplicating by title prefix
  const seenTaskPrefixes = new Set<string>();
  const allTasks: ExtractedTask[] = [];

  // Add transcript tasks first (higher priority)
  for (const task of transcriptTasks) {
    const prefix = task.title.toLowerCase().slice(0, 25);
    if (!seenTaskPrefixes.has(prefix)) {
      seenTaskPrefixes.add(prefix);
      allTasks.push(task);
    }
  }

  // Add summary tasks from decisions (avoid duplicates)
  for (const task of summaryTasks) {
    const prefix = task.title.toLowerCase().slice(0, 25);
    if (!seenTaskPrefixes.has(prefix)) {
      seenTaskPrefixes.add(prefix);
      allTasks.push(task);
    }
  }

  // Add action item tasks from raw text (avoid duplicates)
  for (const task of actionItemTasks) {
    const prefix = task.title.toLowerCase().slice(0, 25);
    if (!seenTaskPrefixes.has(prefix)) {
      seenTaskPrefixes.add(prefix);
      allTasks.push(task);
    }
  }

  // Add action items from parsed summary nextSteps (avoid duplicates)
  for (const task of summaryActionItemTasks) {
    const prefix = task.title.toLowerCase().slice(0, 25);
    if (!seenTaskPrefixes.has(prefix)) {
      seenTaskPrefixes.add(prefix);
      allTasks.push(task);
    }
  }

  console.log('[DEBUG] All stages complete:', {
    transcriptTasks: transcriptTasks.length,
    summaryTasks: summaryTasks.length,
    actionItemTasks: actionItemTasks.length,
    summaryActionItemTasks: summaryActionItemTasks.length,
    totalAllTasks: allTasks.length
  });

  // Stage 8: Apply semantic deduplication as final safety net
  // This catches duplicates that prefix-matching missed (e.g., "Arbeitsgruppe einrichten" vs "Bildung der Arbeitsgruppe")
  const deduplicatedTasks = deduplicateTasksSemantically(allTasks);

  console.log(`Post-Meeting: Extracted ${transcriptTasks.length} tasks from transcript, ${summaryTasks.length} from summary decisions, ${actionItemTasks.length} from raw action items, ${summaryActionItemTasks.length} from nextSteps, ${allTasks.length} after prefix dedup, ${deduplicatedTasks.length} after semantic dedup`);

  onProgress?.('Fertig!', 1.0);

  return {
    summary,
    tasks: deduplicatedTasks,
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
