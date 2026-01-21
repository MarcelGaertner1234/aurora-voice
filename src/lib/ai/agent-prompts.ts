// AI Agent System Prompts for Aurora Meeting Assistant

import type { Meeting, MeetingDecision, MeetingQuestion } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { ProjectContext } from '@/types/project';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Format meeting history for the system prompt (Improvement 3).
 */
function formatMeetingHistory(meetings: Meeting[]): string {
  if (!meetings || meetings.length === 0) return '';

  const meetingList = meetings.slice(0, 5).map(m => {
    const date = format(new Date(m.createdAt), 'dd.MM.yyyy', { locale: de });
    const decisionsCount = m.summary?.decisions?.length || 0;
    const questionsCount = m.summary?.openQuestions?.length || 0;
    const keyPoints = m.summary?.keyPoints?.slice(0, 2).join(', ') || 'Keine Kernpunkte';

    return `- **${date} - ${m.title}**
  Entscheidungen: ${decisionsCount}, Fragen: ${questionsCount}
  Kernpunkte: ${keyPoints}`;
  }).join('\n');

  return `
## Frühere Meetings (gleiches Projekt)
${meetingList}
${meetings.length > 5 ? `\n... und ${meetings.length - 5} weitere Meetings` : ''}`;
}

/**
 * Builds the system prompt for the AI agent with full meeting context.
 */
export function buildAgentSystemPrompt(
  meeting: Meeting,
  tasks: Task[],
  projectContext?: ProjectContext | null,
  relatedMeetings?: Meeting[]
): string {
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const openQuestions = meeting.summary?.openQuestions?.filter(q => !q.answered) || [];
  const answeredQuestions = meeting.summary?.openQuestions?.filter(q => q.answered) || [];
  const decisions = meeting.summary?.decisions || [];

  return `Du bist ein hilfreicher KI-Assistent für Meeting-Nachbereitung. Du hilfst dem Benutzer dabei, Aufgaben zu erledigen, Fragen zu beantworten und Informationen aus dem Meeting-Kontext zu finden.

## Aktuelles Meeting
**Titel:** ${meeting.title}
**Status:** ${meeting.status}
**Erstellt:** ${new Date(meeting.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
${meeting.endedAt ? `**Beendet:** ${new Date(meeting.endedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}

## Zusammenfassung
${meeting.summary?.overview || 'Keine Zusammenfassung verfügbar.'}

## Kernpunkte
${meeting.summary?.keyPoints?.map((p, i) => `${i + 1}. ${p}`).join('\n') || 'Keine Kernpunkte.'}

## Offene Aufgaben (${openTasks.length})
${openTasks.length > 0 ? openTasks.map(t => formatTask(t)).join('\n') : 'Keine offenen Aufgaben.'}

## Erledigte Aufgaben (${completedTasks.length})
${completedTasks.length > 0 ? completedTasks.slice(0, 5).map(t => `- ✓ ${t.title}`).join('\n') : 'Keine erledigten Aufgaben.'}
${completedTasks.length > 5 ? `\n... und ${completedTasks.length - 5} weitere` : ''}

## Entscheidungen (${decisions.length})
${decisions.length > 0 ? decisions.map(d => formatDecision(d)).join('\n') : 'Keine Entscheidungen.'}

## Offene Fragen (${openQuestions.length})
${openQuestions.length > 0 ? openQuestions.map(q => formatQuestion(q)).join('\n') : 'Keine offenen Fragen.'}

## Beantwortete Fragen (${answeredQuestions.length})
${answeredQuestions.length > 0 ? answeredQuestions.slice(0, 3).map(q => `- ✓ ${q.text}${q.answer ? ` → ${q.answer}` : ''}`).join('\n') : 'Keine beantworteten Fragen.'}
${answeredQuestions.length > 3 ? `\n... und ${answeredQuestions.length - 3} weitere` : ''}

## Transkript
${meeting.transcript?.fullText ? `\`\`\`\n${truncateText(meeting.transcript.fullText, 3000)}\n\`\`\`` : 'Kein Transkript verfügbar.'}

${projectContext ? formatProjectContext(projectContext) : '**Hinweis:** Kein Projekt verknüpft. Projekt-Dateien können nicht durchsucht werden.'}
${relatedMeetings && relatedMeetings.length > 0 ? formatMeetingHistory(relatedMeetings) : ''}

## Deine Fähigkeiten
Du kannst dem Benutzer auf folgende Arten helfen:
1. **Fragen beantworten** über das Meeting, die Teilnehmer, Entscheidungen und Aufgaben
2. **Aufgaben analysieren** und Hintergrund-Recherche durchführen
3. **Offene Fragen klären** basierend auf dem Meeting-Kontext
4. **Entscheidungen erklären** und deren Kontext zusammenfassen
${projectContext ? '5. **Code-Dateien finden und durchsuchen** aus dem verknüpften Projekt (inkl. Inhalt-Suche)' : ''}
6. **Internet-Recherche durchführen** mit DuckDuckGo und Wikipedia für aktuelle Informationen
${relatedMeetings && relatedMeetings.length > 0 ? '7. **Kontext aus früheren Meetings** zum selben Projekt nutzen' : ''}

## Wichtige Hinweise
- Antworte immer auf Deutsch
- Sei präzise und hilfreich
- Verweise auf spezifische Stellen im Transkript wenn relevant
- Wenn du dir nicht sicher bist, sage es ehrlich
- Nutze Markdown für Formatierung (Listen, Code-Blöcke, Hervorhebungen)`;
}

/**
 * Format a task for display in the system prompt.
 */
function formatTask(task: Task): string {
  const priorityEmoji = {
    urgent: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  const assignee = task.assigneeName ? ` (@${task.assigneeName})` : '';
  const priority = `${priorityEmoji[task.priority]} ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`;

  return `- [${task.id}] **${task.title}**${assignee} - ${priority}${task.notes ? `\n  Notiz: ${task.notes}` : ''}`;
}

/**
 * Format a decision for display in the system prompt.
 */
function formatDecision(decision: MeetingDecision): string {
  const status = decision.status === 'pending' ? '⏳ Ausstehend' : '✓ Entschieden';
  const assignee = decision.assigneeName ? ` (@${decision.assigneeName})` : '';

  return `- [${decision.id}] ${status}: ${decision.text}${assignee}${decision.context ? `\n  Kontext: ${decision.context}` : ''}`;
}

/**
 * Format a question for display in the system prompt.
 */
function formatQuestion(question: MeetingQuestion): string {
  const assignee = question.assigneeName ? ` (@${question.assigneeName})` : '';

  return `- [${question.id}] ${question.text}${assignee}${question.context ? `\n  Kontext: ${question.context}` : ''}`;
}

/**
 * Format tech stack from package.json dependencies.
 */
function formatTechStack(packageJson?: ProjectContext['packageJson']): string {
  if (!packageJson) return 'Nicht verfügbar (kein package.json)';

  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const techStack: string[] = [];

  // Detect common frameworks and libraries
  if (deps['next']) techStack.push(`Next.js ${deps['next']}`);
  if (deps['react']) techStack.push(`React ${deps['react']}`);
  if (deps['vue']) techStack.push(`Vue ${deps['vue']}`);
  if (deps['angular']) techStack.push(`Angular ${deps['angular']}`);
  if (deps['svelte']) techStack.push('Svelte');
  if (deps['express']) techStack.push(`Express ${deps['express']}`);
  if (deps['fastify']) techStack.push('Fastify');
  if (deps['typescript']) techStack.push(`TypeScript ${deps['typescript']}`);
  if (deps['prisma'] || deps['@prisma/client']) techStack.push('Prisma');
  if (deps['drizzle-orm']) techStack.push('Drizzle ORM');
  if (deps['tailwindcss']) techStack.push('TailwindCSS');
  if (deps['@emotion/react'] || deps['styled-components']) techStack.push('CSS-in-JS');
  if (deps['zustand']) techStack.push('Zustand');
  if (deps['redux']) techStack.push('Redux');
  if (deps['trpc'] || deps['@trpc/server']) techStack.push('tRPC');
  if (deps['zod']) techStack.push('Zod');
  if (deps['jest'] || deps['vitest']) techStack.push(deps['vitest'] ? 'Vitest' : 'Jest');

  if (techStack.length === 0) {
    return 'Nicht erkannt';
  }

  return techStack.join(', ');
}

/**
 * Format project context for the system prompt.
 */
function formatProjectContext(context: ProjectContext): string {
  const topFiles = context.files.slice(0, 30);
  const codeFiles = topFiles.filter(f => f.type === 'code');
  const docFiles = topFiles.filter(f => f.type === 'doc');
  const configFiles = topFiles.filter(f => f.type === 'config');

  let result = `## Verknüpftes Projekt
**Name:** ${context.name}
**Pfad:** ${context.rootPath}
**Dateien:** ${context.totalFiles} insgesamt (${codeFiles.length} Code, ${docFiles.length} Docs, ${configFiles.length} Config)

### Tech Stack
${formatTechStack(context.packageJson)}
`;

  // Add project analysis if available (Improvement 4)
  if (context.analysis) {
    result += `
### Projekt-Analyse
**Zusammenfassung:** ${context.analysis.summary}
**Architektur:** ${context.analysis.architecture}
${context.analysis.conventions.length > 0 ? `**Konventionen:** ${context.analysis.conventions.join(', ')}` : ''}
`;
  }

  // Add README if available (Improvement 1)
  if (context.readmeContent) {
    result += `
### README
\`\`\`markdown
${context.readmeContent.slice(0, 1500)}
\`\`\`
`;
  }

  // Add directory structure if available (Improvement 5)
  if (context.directoryStructure) {
    result += `
### Verzeichnisstruktur
\`\`\`
${context.directoryStructure}
\`\`\`
`;
  }

  // Add important files
  result += `
### Wichtige Dateien
${topFiles.slice(0, 15).map(f => `- \`${f.path}\` (${f.type})`).join('\n')}
${context.files.length > 15 ? `\n... und ${context.files.length - 15} weitere Dateien` : ''}`;

  return result;
}

/**
 * Truncate text to a maximum length, adding ellipsis if truncated.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n[... Transkript gekürzt ...]';
}

/**
 * Build a focused prompt for a specific quick action.
 */
export function buildQuickActionPrompt(
  actionId: string,
  selectionContext: string,
  meeting: Meeting,
  tasks: Task[]
): string {
  switch (actionId) {
    case 'research-task':
      const task = tasks.find(t => t.id === selectionContext || t.title.includes(selectionContext));
      if (task) {
        return `Recherchiere Hintergrund und mögliche nächste Schritte für diese Aufgabe:

**Aufgabe:** ${task.title}
${task.description ? `**Beschreibung:** ${task.description}` : ''}
${task.assigneeName ? `**Zugewiesen an:** ${task.assigneeName}` : ''}
${task.sourceText ? `**Originaltext aus Meeting:** "${task.sourceText}"` : ''}
${task.notes ? `**Notizen:** ${task.notes}` : ''}

Bitte analysiere:
1. Was ist der Kontext dieser Aufgabe basierend auf dem Meeting?
2. Welche konkreten Schritte wären sinnvoll?
3. Gibt es Abhängigkeiten zu anderen Aufgaben oder Entscheidungen?
4. Welche Ressourcen oder Informationen werden benötigt?`;
      }
      return `Recherchiere Hintergrund für: ${selectionContext}`;

    case 'answer-question':
      const question = meeting.summary?.openQuestions?.find(
        q => q.id === selectionContext || q.text.includes(selectionContext)
      );
      if (question) {
        return `Beantworte diese offene Frage basierend auf dem Meeting-Kontext:

**Frage:** ${question.text}
${question.context ? `**Kontext:** ${question.context}` : ''}
${question.assigneeName ? `**Gerichtet an:** ${question.assigneeName}` : ''}

Bitte:
1. Versuche die Frage basierend auf den Meeting-Informationen zu beantworten
2. Wenn die Antwort nicht eindeutig ist, gib mögliche Ansätze
3. Weise auf fehlende Informationen hin, falls relevant`;
      }
      return `Beantworte diese Frage: ${selectionContext}`;

    case 'find-code':
      return `Finde relevante Code-Dateien im verknüpften Projekt für: ${selectionContext}

Bitte:
1. Suche nach Dateien, die mit dem Thema zusammenhängen könnten
2. Erkläre kurz, warum diese Dateien relevant sein könnten
3. Gib konkrete Dateipfade an, wenn möglich`;

    case 'explain-decision':
      const decision = meeting.summary?.decisions?.find(
        d => d.id === selectionContext || d.text.includes(selectionContext)
      );
      if (decision) {
        return `Erkläre den Kontext und die Auswirkungen dieser Entscheidung:

**Entscheidung:** ${decision.text}
${decision.context ? `**Kontext:** ${decision.context}` : ''}
${decision.status ? `**Status:** ${decision.status === 'decided' ? 'Getroffen' : 'Ausstehend'}` : ''}
${decision.assigneeName ? `**Verantwortlich:** ${decision.assigneeName}` : ''}
${decision.suggestedAction ? `**Vorgeschlagene Aktion:** ${decision.suggestedAction}` : ''}

Bitte analysiere:
1. Warum wurde diese Entscheidung getroffen (basierend auf dem Meeting-Kontext)?
2. Welche Auswirkungen hat sie auf das Projekt/Team?
3. Gibt es damit verbundene Aufgaben oder weitere Entscheidungen?`;
      }
      return `Erkläre diese Entscheidung: ${selectionContext}`;

    default:
      return selectionContext;
  }
}
