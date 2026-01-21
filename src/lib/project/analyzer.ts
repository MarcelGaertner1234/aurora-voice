// Project Analyzer for Aurora Voice
// Generates AI-powered project analysis

import { streamText, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Settings } from '@/types';
import type { ProjectContext, ProjectAnalysis } from '@/types/project';
import { getContextSummary, getFilesByType } from './indexer';

// Prompt for project analysis
const PROJECT_ANALYSIS_SYSTEM_PROMPT = `Du bist ein erfahrener Software-Architekt und Code-Analyst.
Deine Aufgabe ist es, Softwareprojekte zu analysieren und hilfreiche Zusammenfassungen zu erstellen,
die Entwicklern helfen, das Projekt schnell zu verstehen.

Deine Stärken:
- Du erkennst Architektur-Patterns und Technologie-Stacks
- Du identifizierst die wichtigsten Dateien und Einstiegspunkte
- Du verstehst Code-Konventionen und Best Practices
- Du gibst präzise, actionable Informationen

Deine Regeln:
- Analysiere nur was du sehen kannst
- Erfinde keine Informationen
- Sei präzise und technisch korrekt
- Verwende deutsche Sprache für die Ausgabe`;

const PROJECT_ANALYSIS_PROMPT = `Analysiere das folgende Softwareprojekt und erstelle eine strukturierte Analyse.

Projektname: {projectName}
Anzahl Dateien: {totalFiles}

Dateistruktur:
{fileList}

Config-Dateien:
{configFiles}

Erstelle eine JSON-Antwort mit folgendem Format:
{
  "summary": "Kurze Zusammenfassung des Projekts (2-3 Sätze)",
  "architecture": "Beschreibung der Architektur (1-2 Sätze)",
  "keyFiles": ["wichtige/datei1.ts", "wichtige/datei2.ts"],
  "techStack": ["Tech1", "Tech2", "Tech3"],
  "conventions": ["Konvention 1", "Konvention 2"]
}

Wichtig:
- keyFiles sollten max. 10 der wichtigsten Dateien sein (Einstiegspunkte, Hauptlogik)
- techStack sollte erkannte Frameworks, Libraries und Tools enthalten
- conventions sollte erkannte Code-Konventionen beschreiben (Namenskonventionen, Ordnerstruktur, etc.)

Antworte NUR mit dem JSON-Objekt, keine Erklärungen davor oder danach.`;

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

function buildPrompt(context: ProjectContext): string {
  // Get file list (limited for prompt size)
  const codeFiles = getFilesByType(context, 'code').slice(0, 100);
  const configFiles = getFilesByType(context, 'config');
  const docFiles = getFilesByType(context, 'doc').slice(0, 20);

  const fileList = [
    ...codeFiles.map((f) => f.path),
    ...docFiles.map((f) => f.path),
  ].join('\n');

  const configFilesList = configFiles
    .map((f) => `${f.path}${f.snippet ? `\n---\n${f.snippet}\n---` : ''}`)
    .join('\n\n');

  return PROJECT_ANALYSIS_PROMPT
    .replace('{projectName}', context.name)
    .replace('{totalFiles}', String(context.totalFiles))
    .replace('{fileList}', fileList || 'Keine Dateien gefunden')
    .replace('{configFiles}', configFilesList || 'Keine Config-Dateien gefunden');
}

function parseAnalysisResponse(response: string): Omit<ProjectAnalysis, 'generatedAt'> {
  // Try to extract JSON from response (handle markdown code blocks)
  let jsonStr = response.trim();

  // Remove markdown code block if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary || 'Keine Zusammenfassung verfügbar',
      architecture: parsed.architecture || 'Nicht analysiert',
      keyFiles: Array.isArray(parsed.keyFiles) ? parsed.keyFiles : [],
      techStack: Array.isArray(parsed.techStack) ? parsed.techStack : [],
      conventions: Array.isArray(parsed.conventions) ? parsed.conventions : [],
    };
  } catch (err) {
    console.error('Failed to parse analysis response:', err);
    // Return fallback analysis
    return {
      summary: 'Analyse konnte nicht vollständig durchgeführt werden.',
      architecture: 'Unbekannt',
      keyFiles: [],
      techStack: [],
      conventions: [],
    };
  }
}

export interface AnalyzeProjectOptions {
  context: ProjectContext;
  settings: Settings;
  onProgress?: (status: string) => void;
}

export async function analyzeProject({
  context,
  settings,
  onProgress,
}: AnalyzeProjectOptions): Promise<ProjectAnalysis> {
  onProgress?.('Erstelle Analyse-Prompt...');

  const model = getModel(settings);
  const prompt = buildPrompt(context);

  onProgress?.('Analysiere Projekt mit KI...');

  try {
    const { text } = await generateText({
      model,
      system: PROJECT_ANALYSIS_SYSTEM_PROMPT,
      prompt,
    });

    onProgress?.('Verarbeite Ergebnis...');

    const analysis = parseAnalysisResponse(text);

    onProgress?.('Analyse abgeschlossen!');

    return {
      ...analysis,
      generatedAt: new Date(),
    };
  } catch (err) {
    console.error('Project analysis failed:', err);
    throw new Error(`Projektanalyse fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
  }
}

// Quick analysis without AI (based on file structure)
export function quickAnalyzeProject(context: ProjectContext): ProjectAnalysis {
  const codeFiles = getFilesByType(context, 'code');
  const configFiles = getFilesByType(context, 'config');

  // Detect tech stack from config files
  const techStack: string[] = [];
  const configNames = configFiles.map((f) => f.name.toLowerCase());

  if (configNames.includes('package.json')) techStack.push('Node.js');
  if (configNames.includes('tsconfig.json')) techStack.push('TypeScript');
  if (configNames.includes('next.config.js') || configNames.includes('next.config.ts') || configNames.includes('next.config.mjs')) techStack.push('Next.js');
  if (configNames.includes('vite.config.ts') || configNames.includes('vite.config.js')) techStack.push('Vite');
  if (configNames.includes('tailwind.config.js') || configNames.includes('tailwind.config.ts')) techStack.push('Tailwind CSS');
  if (configNames.includes('cargo.toml')) techStack.push('Rust');
  if (configNames.includes('go.mod')) techStack.push('Go');
  if (configNames.includes('requirements.txt') || configNames.includes('pyproject.toml')) techStack.push('Python');
  if (configNames.includes('docker-compose.yml') || configNames.includes('dockerfile')) techStack.push('Docker');

  // Detect React/Vue from file extensions
  const extensions = new Set(codeFiles.map((f) => f.extension));
  if (extensions.has('.tsx') || extensions.has('.jsx')) techStack.push('React');
  if (extensions.has('.vue')) techStack.push('Vue');
  if (extensions.has('.svelte')) techStack.push('Svelte');

  // Identify key files
  const keyFiles = [
    ...configFiles.filter((f) =>
      ['package.json', 'tsconfig.json', 'cargo.toml', 'go.mod'].includes(f.name)
    ),
    ...codeFiles.filter((f) =>
      f.name.match(/^(index|main|app|server)\.(ts|tsx|js|jsx|py|go|rs)$/)
    ),
  ]
    .slice(0, 10)
    .map((f) => f.path);

  // Detect architecture from folder structure
  const folders = new Set(
    codeFiles.map((f) => {
      const parts = f.path.split('/');
      return parts.length > 1 ? parts[0] : '';
    }).filter(Boolean)
  );

  let architecture = 'Standard-Projektstruktur';
  if (folders.has('src') && folders.has('pages')) {
    architecture = 'Next.js App-Struktur';
  } else if (folders.has('src') && folders.has('app')) {
    architecture = 'Next.js 13+ App Router Struktur';
  } else if (folders.has('components') && folders.has('lib')) {
    architecture = 'Komponenten-basierte Architektur';
  } else if (folders.has('cmd') && folders.has('pkg')) {
    architecture = 'Go Standard Layout';
  }

  return {
    summary: `${context.name} ist ein ${techStack.slice(0, 3).join('/')} Projekt mit ${context.totalFiles} Dateien.`,
    architecture,
    keyFiles,
    techStack: [...new Set(techStack)], // Remove duplicates
    conventions: detectConventions(context),
    generatedAt: new Date(),
  };
}

function detectConventions(context: ProjectContext): string[] {
  const conventions: string[] = [];
  const codeFiles = getFilesByType(context, 'code');

  // Check naming conventions
  const hasKebabCase = codeFiles.some((f) => f.name.match(/^[a-z]+-[a-z]+/));
  const hasCamelCase = codeFiles.some((f) => f.name.match(/^[a-z]+[A-Z]/));
  const hasPascalCase = codeFiles.some((f) => f.name.match(/^[A-Z][a-z]+[A-Z]/));

  if (hasKebabCase) conventions.push('Kebab-case Dateinamen');
  if (hasCamelCase) conventions.push('CamelCase Dateinamen');
  if (hasPascalCase) conventions.push('PascalCase Komponenten');

  // Check folder structure
  const folders = new Set(codeFiles.map((f) => f.path.split('/')[0]).filter(Boolean));
  if (folders.has('components')) conventions.push('Komponenten in /components');
  if (folders.has('lib')) conventions.push('Utilities in /lib');
  if (folders.has('hooks')) conventions.push('Custom Hooks in /hooks');
  if (folders.has('types')) conventions.push('Type Definitionen in /types');
  if (folders.has('utils')) conventions.push('Utilities in /utils');

  return conventions.slice(0, 5);
}

export default analyzeProject;
