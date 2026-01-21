// Decision Tracking Prompts for Aurora Meeting Assistant

export const DECISION_DETECTION_PROMPT = `Analysiere das Meeting-Transkript und identifiziere alle getroffenen Entscheidungen.

Eine Entscheidung ist:
- Eine explizite Festlegung ("Wir machen X")
- Eine Vereinbarung zwischen Teilnehmern
- Ein genehmigter Vorschlag
- Eine Zustimmung zu einem Plan

NICHT als Entscheidung zählen:
- Offene Vorschläge ohne Zustimmung
- Diskussionen ohne Ergebnis
- Persönliche Meinungen
- Fragen

Für jede Entscheidung erfasse:
1. Die Entscheidung selbst (klar formuliert)
2. Den Kontext (warum wurde sie getroffen)
3. Beteiligte Personen (falls genannt)
4. Priorität (hoch/mittel/niedrig)
5. Zeitrahmen (falls genannt)

Transkript:
{transcript}

Antworte im JSON-Format:
[
  {
    "decision": "Die Entscheidung",
    "context": "Kontext",
    "participants": ["Name1", "Name2"],
    "priority": "high|medium|low",
    "timeframe": "Zeitrahmen oder null",
    "confidence": 0.9
  }
]`;

export const AGREEMENT_DETECTION_PROMPT = `Finde alle Vereinbarungen und Zusagen im Meeting-Transkript.

Suche nach:
- "Ich werde..." / "Ich mache..."
- "Wir vereinbaren..."
- "Abgemacht" / "Einverstanden"
- Zusagen mit Terminen

Transkript:
{transcript}

Format:
[
  {
    "agreement": "Die Vereinbarung",
    "by": "Person die zugesagt hat",
    "deadline": "Termin falls genannt",
    "witnessed": ["Andere Anwesende"]
  }
]`;

export const IMPACT_ASSESSMENT_PROMPT = `Bewerte die Auswirkungen der folgenden Entscheidungen:

Entscheidungen:
{decisions}

Für jede Entscheidung analysiere:
1. Betroffene Bereiche (Team, Projekt, Budget, etc.)
2. Kurzfristige Auswirkungen
3. Langfristige Auswirkungen
4. Potenzielle Risiken
5. Erforderliche Ressourcen

Antworte strukturiert für jede Entscheidung.`;

export const DECISION_TIMELINE_PROMPT = `Erstelle eine Zeitleiste der Entscheidungen aus dem Meeting.

Transkript:
{transcript}

Ordne die Entscheidungen chronologisch und zeige:
- Zeitpunkt im Meeting (ungefähr)
- Die Entscheidung
- Wie sie zustande kam (Diskussion, Abstimmung, Einzelentscheidung)`;

// Template functions
export function createDecisionDetectionPrompt(transcript: string): string {
  return DECISION_DETECTION_PROMPT.replace('{transcript}', transcript);
}

export function createAgreementDetectionPrompt(transcript: string): string {
  return AGREEMENT_DETECTION_PROMPT.replace('{transcript}', transcript);
}

export function createImpactAssessmentPrompt(decisions: string[]): string {
  return IMPACT_ASSESSMENT_PROMPT.replace('{decisions}', decisions.join('\n- '));
}

export function createDecisionTimelinePrompt(transcript: string): string {
  return DECISION_TIMELINE_PROMPT.replace('{transcript}', transcript);
}

// Decision categories
export const DECISION_CATEGORIES = [
  { id: 'strategic', label: 'Strategisch', description: 'Langfristige Ausrichtung' },
  { id: 'operational', label: 'Operativ', description: 'Tägliche Abläufe' },
  { id: 'financial', label: 'Finanziell', description: 'Budget und Ressourcen' },
  { id: 'technical', label: 'Technisch', description: 'Technische Lösungen' },
  { id: 'personnel', label: 'Personal', description: 'Mitarbeiter und Teams' },
  { id: 'process', label: 'Prozess', description: 'Arbeitsabläufe' },
] as const;

export type DecisionCategory = typeof DECISION_CATEGORIES[number]['id'];
