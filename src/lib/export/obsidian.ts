// Obsidian Export for Aurora Voice

import { writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { exportForObsidian, generateMeetingFilename } from './markdown';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';
import type { SpeakerProfile } from '@/types/speaker';
import type { Settings } from '@/types';

export async function saveToObsidian(
  meeting: Meeting,
  tasks: Task[],
  speakers: SpeakerProfile[],
  settings: Settings
): Promise<string> {
  if (!settings.obsidianVaultPath) {
    throw new Error('Obsidian Vault nicht konfiguriert');
  }

  const subfolder = await join(settings.obsidianVaultPath, settings.obsidianSubfolder);

  // Create subfolder if not exists
  if (!(await exists(subfolder))) {
    await mkdir(subfolder, { recursive: true });
  }

  const filename = generateMeetingFilename(meeting);
  const filepath = await join(subfolder, filename);
  const content = exportForObsidian(meeting, tasks, speakers);

  await writeTextFile(filepath, content);
  return filepath;
}

// Simple export without meeting structure (for quick notes/code mode)
export async function saveSimpleToObsidian(
  content: string,
  title: string,
  mode: 'notes' | 'meeting' | 'code',
  settings: Settings
): Promise<string> {
  if (!settings.obsidianVaultPath) {
    throw new Error('Obsidian Vault nicht konfiguriert');
  }

  const subfolder = await join(settings.obsidianVaultPath, settings.obsidianSubfolder);

  // Create subfolder if not exists
  if (!(await exists(subfolder))) {
    await mkdir(subfolder, { recursive: true });
  }

  // Generate filename with date
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const titleSlug = title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const filename = titleSlug ? `${dateStr}-${titleSlug}.md` : `${dateStr}-aurora-${mode}.md`;
  const filepath = await join(subfolder, filename);

  // Create content with YAML frontmatter
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: "${title || `Aurora ${mode.charAt(0).toUpperCase() + mode.slice(1)}`}"`);
  lines.push(`date: ${dateStr}`);
  lines.push(`time: "${date.toTimeString().slice(0, 5)}"`);
  lines.push(`type: ${mode}`);
  lines.push(`tags: [aurora, ${mode}]`);
  lines.push('---');
  lines.push('');
  lines.push(content);

  await writeTextFile(filepath, lines.join('\n'));
  return filepath;
}
