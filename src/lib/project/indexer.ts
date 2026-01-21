// Project Indexer for Aurora Voice
// Scans and indexes project files for context-aware features

import { readDir, readTextFile, stat } from '@tauri-apps/plugin-fs';
import { basename, join } from '@tauri-apps/api/path';
import type {
  ProjectContext,
  ProjectFile,
  ProjectFileType,
  IndexSettings,
} from '@/types/project';
import {
  CODE_EXTENSIONS,
  DOC_EXTENSIONS,
  CONFIG_EXTENSIONS,
  CONFIG_FILES,
  IGNORE_DIRECTORIES,
  IGNORE_PATTERNS,
  MAX_SNIPPET_FILE_SIZE,
  SNIPPET_MAX_LENGTH,
  DEFAULT_INDEX_SETTINGS,
} from '@/types/project';
import { createAuroraFS } from '@/lib/storage/aurora-fs';

// Classify a file by its extension
export function classifyFile(name: string, extension: string): ProjectFileType {
  // Check if it's a known config file
  if (CONFIG_FILES.includes(name)) {
    return 'config';
  }

  const ext = extension.toLowerCase();

  if (CODE_EXTENSIONS.includes(ext)) {
    return 'code';
  }
  if (DOC_EXTENSIONS.includes(ext)) {
    return 'doc';
  }
  if (CONFIG_EXTENSIONS.includes(ext)) {
    return 'config';
  }

  return 'other';
}

// Check if a directory should be ignored
function shouldIgnoreDirectory(name: string): boolean {
  return IGNORE_DIRECTORIES.includes(name);
}

// Check if a file should be ignored
function shouldIgnoreFile(
  name: string,
  settings: IndexSettings
): boolean {
  // Always ignore hidden files
  if (name.startsWith('.') && !CONFIG_FILES.includes(name)) {
    return true;
  }

  // Check ignore patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(name)) {
      // Special handling for test and declaration files
      if (/\.test\.|\.spec\./.test(name) && settings.includeTests) {
        continue;
      }
      if (/\.d\.ts$/.test(name) && settings.includeDeclarations) {
        continue;
      }
      return true;
    }
  }

  // Check custom ignore patterns
  if (settings.customIgnorePatterns) {
    for (const pattern of settings.customIgnorePatterns) {
      if (new RegExp(pattern).test(name)) {
        return true;
      }
    }
  }

  return false;
}

// Get file extension (with dot)
function getExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) {
    return '';
  }
  return name.slice(lastDot);
}

// Extract a snippet from file content
function extractSnippet(content: string): string {
  if (!content) return '';

  // Clean up the content
  let snippet = content
    .slice(0, SNIPPET_MAX_LENGTH * 2) // Get more than needed for processing
    .replace(/^\s*[\r\n]+/gm, '\n') // Normalize line breaks
    .replace(/\t/g, '  '); // Replace tabs with spaces

  // Try to find meaningful content
  // Skip license headers, imports, etc.
  const lines = snippet.split('\n');
  const meaningfulLines: string[] = [];
  let foundContent = false;
  let wasTruncated = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip common header patterns
    if (!foundContent) {
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.startsWith('require(') ||
        trimmed.startsWith('use ') ||
        trimmed.startsWith('package ') ||
        trimmed === ''
      ) {
        continue;
      }
      foundContent = true;
    }

    meaningfulLines.push(line);

    // Stop when we have enough content
    if (meaningfulLines.join('\n').length >= SNIPPET_MAX_LENGTH) {
      wasTruncated = true;
      break;
    }
  }

  const joinedContent = meaningfulLines.join('\n');
  // Track if we need to truncate the final joined content
  if (joinedContent.length > SNIPPET_MAX_LENGTH) {
    wasTruncated = true;
  }
  snippet = joinedContent.slice(0, SNIPPET_MAX_LENGTH);

  // Add ellipsis if content was actually truncated
  if (wasTruncated && snippet.length >= 3) {
    snippet = snippet.slice(0, -3) + '...';
  }

  return snippet;
}

// Get project name from package.json or folder name
async function getProjectName(rootPath: string): Promise<string> {
  try {
    const packageJsonPath = await join(rootPath, 'package.json');
    const content = await readTextFile(packageJsonPath);
    const packageJson = JSON.parse(content);
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch {
    // No package.json or invalid JSON
  }

  // Fall back to folder name
  return basename(rootPath);
}

// Recursive directory scanning
async function scanDirectory(
  dirPath: string,
  rootPath: string,
  settings: IndexSettings,
  onProgress?: (scanned: number) => void,
  scannedCount = { value: 0 }
): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];
  const maxFiles = settings.maxFiles || DEFAULT_INDEX_SETTINGS.maxFiles!;

  try {
    const entries = await readDir(dirPath);

    for (const entry of entries) {
      // Check if we've hit the max
      if (scannedCount.value >= maxFiles) {
        break;
      }

      const entryPath = await join(dirPath, entry.name);
      const relativePath = entryPath.replace(rootPath + '/', '');

      if (entry.isDirectory) {
        // Skip ignored directories
        if (shouldIgnoreDirectory(entry.name)) {
          continue;
        }

        // Recursively scan subdirectory
        const subFiles = await scanDirectory(
          entryPath,
          rootPath,
          settings,
          onProgress,
          scannedCount
        );
        files.push(...subFiles);
      } else if (entry.isFile) {
        // Skip ignored files
        if (shouldIgnoreFile(entry.name, settings)) {
          continue;
        }

        const extension = getExtension(entry.name);
        const fileType = classifyFile(entry.name, extension);

        // Only index relevant file types
        if (fileType === 'other') {
          continue;
        }

        try {
          const fileStat = await stat(entryPath);

          let snippet: string | undefined;

          // Extract snippet if enabled and file is not too large
          if (
            settings.extractSnippets &&
            fileStat.size <= MAX_SNIPPET_FILE_SIZE &&
            fileType === 'code'
          ) {
            try {
              const content = await readTextFile(entryPath);
              snippet = extractSnippet(content);
            } catch {
              // Skip snippet extraction on error
            }
          }

          const projectFile: ProjectFile = {
            path: relativePath,
            absolutePath: entryPath,
            name: entry.name,
            extension,
            type: fileType,
            size: fileStat.size,
            lastModified: new Date(fileStat.mtime || Date.now()),
            snippet,
          };

          files.push(projectFile);
          scannedCount.value++;

          if (onProgress) {
            onProgress(scannedCount.value);
          }
        } catch {
          // Skip files we can't stat
          continue;
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err);
  }

  return files;
}

// Main indexing function
export async function indexProject(
  rootPath: string,
  settings: IndexSettings = DEFAULT_INDEX_SETTINGS,
  onProgress?: (scanned: number, phase: string) => void,
  persistToAurora = true
): Promise<ProjectContext> {
  onProgress?.(0, 'Lese Projektname...');

  const name = await getProjectName(rootPath);

  onProgress?.(0, 'Scanne Dateien...');

  const files = await scanDirectory(rootPath, rootPath, settings, (scanned) => {
    onProgress?.(scanned, `${scanned} Dateien gescannt...`);
  });

  // Sort files by type and then by path
  files.sort((a, b) => {
    // Prioritize code files
    const typeOrder: Record<ProjectFileType, number> = {
      code: 0,
      config: 1,
      doc: 2,
      other: 3,
    };
    const typeCompare = typeOrder[a.type] - typeOrder[b.type];
    if (typeCompare !== 0) return typeCompare;
    return a.path.localeCompare(b.path);
  });

  const context: ProjectContext = {
    rootPath,
    name,
    files,
    totalFiles: files.length,
    indexedAt: new Date(),
  };

  // Persist context to .aurora folder if enabled
  if (persistToAurora) {
    try {
      onProgress?.(files.length, 'Speichere Index...');
      const fs = createAuroraFS(rootPath);
      await fs.writeContextIndex(context);
    } catch (err) {
      console.warn('Could not persist project context to .aurora folder:', err);
    }
  }

  onProgress?.(files.length, 'Fertig!');

  return context;
}

// Re-index only changed files (stub for future implementation)
export async function refreshIndex(
  context: ProjectContext,
  settings: IndexSettings = DEFAULT_INDEX_SETTINGS
): Promise<ProjectContext> {
  // For now, just do a full re-index
  return indexProject(context.rootPath, settings);
}

// Get files by type
export function getFilesByType(
  context: ProjectContext,
  type: ProjectFileType
): ProjectFile[] {
  return context.files.filter((f) => f.type === type);
}

// Search files by name
export function searchFilesByName(
  context: ProjectContext,
  query: string
): ProjectFile[] {
  const lowerQuery = query.toLowerCase();
  return context.files.filter(
    (f) =>
      f.name.toLowerCase().includes(lowerQuery) ||
      f.path.toLowerCase().includes(lowerQuery)
  );
}

// Get files in a directory
export function getFilesInDirectory(
  context: ProjectContext,
  dirPath: string
): ProjectFile[] {
  const normalizedDir = dirPath.endsWith('/') ? dirPath : dirPath + '/';
  return context.files.filter(
    (f) => f.path.startsWith(normalizedDir) && !f.path.slice(normalizedDir.length).includes('/')
  );
}

// Get directory structure (Fix: Use null-safe access instead of non-null assertion)
export function getDirectoryStructure(
  context: ProjectContext
): Map<string, ProjectFile[]> {
  const structure = new Map<string, ProjectFile[]>();

  for (const file of context.files) {
    const lastSlash = file.path.lastIndexOf('/');
    const dir = lastSlash === -1 ? '' : file.path.slice(0, lastSlash);

    // Fix: Use get-or-create pattern to avoid non-null assertion
    const existing = structure.get(dir);
    if (existing) {
      existing.push(file);
    } else {
      structure.set(dir, [file]);
    }
  }

  return structure;
}

// Export summary for AI prompts
export function getContextSummary(context: ProjectContext, maxFiles = 50): string {
  const codeFiles = getFilesByType(context, 'code');
  const configFiles = getFilesByType(context, 'config');
  const docFiles = getFilesByType(context, 'doc');

  // Prioritize important files
  // Fix H9: Use Math.max to prevent negative slice indices when maxFiles < 5
  const codeFilesLimit = Math.max(0, maxFiles - 5);
  const importantFiles = [
    ...configFiles.filter((f) =>
      ['package.json', 'tsconfig.json', 'next.config.js', 'vite.config.ts'].includes(f.name)
    ),
    ...codeFiles.slice(0, codeFilesLimit),
  ].slice(0, maxFiles);

  let summary = `Projekt: ${context.name}\n`;
  summary += `Dateien: ${context.totalFiles} (${codeFiles.length} Code, ${configFiles.length} Config, ${docFiles.length} Docs)\n\n`;
  summary += `Wichtige Dateien:\n`;
  summary += importantFiles.map((f) => `- ${f.path}`).join('\n');

  return summary;
}
