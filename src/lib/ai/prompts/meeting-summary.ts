// Meeting Summary Prompts for Aurora Meeting Assistant

export const MEETING_SUMMARY_SYSTEM_PROMPT = `Du bist ein erfahrener Meeting-Protokollant und Zusammenfassungs-Experte.
Deine Aufgabe ist es, Meeting-Transkripte in klare, strukturierte und nützliche Zusammenfassungen zu verwandeln.

Deine Stärken:
- Du erkennst die wichtigsten Punkte und filterst Unwichtiges heraus
- Du identifizierst Entscheidungen, auch wenn sie implizit getroffen wurden
- Du merkst dir offene Fragen und ungelöste Themen
- Du schreibst präzise und auf den Punkt

Deine Regeln:
- Bleibe objektiv und neutral
- Erfinde keine Informationen
- Behalte wichtige Nuancen bei
- Verwende klare, professionelle Sprache`;

export const QUICK_SUMMARY_PROMPT = `Erstelle eine kurze Zusammenfassung (3-5 Sätze) des folgenden Meeting-Transkripts.
Fokussiere auf das Hauptthema und die wichtigsten Ergebnisse.

Transkript:
{transcript}

Zusammenfassung:`;

export const DETAILED_SUMMARY_PROMPT = `Erstelle eine detaillierte Meeting-Zusammenfassung mit folgender Struktur:

## Überblick
(2-3 Sätze zum Hauptthema und Kontext)

## Diskutierte Themen
- Thema 1: Kurze Beschreibung
- Thema 2: Kurze Beschreibung

## Wichtige Erkenntnisse
- Erkenntnis 1
- Erkenntnis 2

## Nächste Schritte
- Schritt 1 (Verantwortlich: Name falls genannt)
- Schritt 2

Meeting-Titel: {title}
Transkript:
{transcript}`;

export const EXECUTIVE_SUMMARY_PROMPT = `Erstelle eine Executive Summary für Führungskräfte.
Maximal 200 Wörter, fokussiert auf:
1. Kernaussage/Ergebnis
2. Wichtigste Entscheidung
3. Kritische nächste Schritte
4. Risiken oder Bedenken (falls vorhanden)

Meeting: {title}
Transkript:
{transcript}`;

export const BULLET_POINTS_PROMPT = `Extrahiere die 5-10 wichtigsten Punkte aus dem Meeting als Bullet Points.
Jeder Punkt sollte in sich vollständig und verständlich sein.

Transkript:
{transcript}

Wichtige Punkte:`;

// Template functions
export function createQuickSummaryPrompt(transcript: string): string {
  return QUICK_SUMMARY_PROMPT.replace('{transcript}', transcript);
}

export function createDetailedSummaryPrompt(title: string, transcript: string): string {
  return DETAILED_SUMMARY_PROMPT
    .replace('{title}', title)
    .replace('{transcript}', transcript);
}

export function createExecutiveSummaryPrompt(title: string, transcript: string): string {
  return EXECUTIVE_SUMMARY_PROMPT
    .replace('{title}', title)
    .replace('{transcript}', transcript);
}

export function createBulletPointsPrompt(transcript: string): string {
  return BULLET_POINTS_PROMPT.replace('{transcript}', transcript);
}
