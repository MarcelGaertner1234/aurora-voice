// Project Context Types for Aurora Voice

export type ProjectFileType = 'code' | 'doc' | 'config' | 'other';

export interface ProjectFile {
  path: string;           // Relative path from project root
  absolutePath: string;   // Absolute path
  name: string;           // File name
  extension: string;      // Extension (.ts, .md, etc.)
  type: ProjectFileType;  // Classification
  size: number;           // Size in bytes
  lastModified: Date;     // Last modification time
  snippet?: string;       // First ~500 characters for context
}

// Parsed package.json data for AI context
export interface PackageJsonData {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface ProjectContext {
  rootPath: string;       // Absolute path to project root
  name: string;           // Project name (from package.json or folder name)
  files: ProjectFile[];   // Indexed files
  totalFiles: number;     // Total number of files
  indexedAt: Date;        // When the index was created

  // Extended context for AI (Improvements 1, 4, 5)
  readmeContent?: string;        // README.md content (max 2000 chars)
  packageJson?: PackageJsonData; // Parsed package.json data
  directoryStructure?: string;   // Tree-style directory structure
  analysis?: ProjectAnalysis;    // Quick project analysis (Improvement 4)
}

export type MatchType = 'exact' | 'partial' | 'fuzzy';

export interface ProjectMatch {
  file: ProjectFile;
  matchType: MatchType;
  relevance: number;      // 0-1 relevance score
  matchedText: string;    // Text from transcript that matched
  highlightedPath?: string; // Path with matched part highlighted
}

// File extension classifications
export const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift',
  '.rb', '.php', '.vue', '.svelte', '.astro',
];

export const DOC_EXTENSIONS = [
  '.md', '.mdx', '.txt', '.rst', '.adoc', '.asciidoc',
  '.org', '.wiki', '.tex',
];

export const CONFIG_EXTENSIONS = [
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini',
  '.env', '.env.example', '.env.local', '.env.development',
];

export const CONFIG_FILES = [
  'package.json', 'tsconfig.json', 'vite.config.ts', 'next.config.js',
  'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js',
  'eslint.config.js', '.eslintrc.js', '.prettierrc', 'Cargo.toml',
  'go.mod', 'requirements.txt', 'Pipfile', 'Gemfile', 'pom.xml',
  'build.gradle', 'CMakeLists.txt', 'Makefile', 'Dockerfile',
  'docker-compose.yml', '.gitignore', '.dockerignore',
];

// Directories to ignore during indexing
export const IGNORE_DIRECTORIES = [
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', '.mypy_cache',
  'venv', '.venv', 'env', '.env',
  'target', 'bin', 'obj',
  '.idea', '.vscode', '.vs',
  'coverage', '.nyc_output',
  '.turbo', '.cache',
  'vendor',
];

// File patterns to ignore
export const IGNORE_PATTERNS = [
  /\.lock$/,          // lock files
  /\.map$/,           // source maps
  /\.min\./,          // minified files
  /\.d\.ts$/,         // declaration files (optional)
  /\.test\./,         // test files (optional)
  /\.spec\./,         // spec files (optional)
];

// Maximum file size for snippet extraction (500KB)
export const MAX_SNIPPET_FILE_SIZE = 500 * 1024;

// Maximum number of characters for snippet
export const SNIPPET_MAX_LENGTH = 500;

// Default index settings
export interface IndexSettings {
  maxFiles?: number;              // Maximum number of files to index
  includeTests?: boolean;         // Include test files
  includeDeclarations?: boolean;  // Include .d.ts files
  extractSnippets?: boolean;      // Extract file snippets
  customIgnorePatterns?: string[];
}

export const DEFAULT_INDEX_SETTINGS: IndexSettings = {
  maxFiles: 5000,
  includeTests: false,
  includeDeclarations: false,
  extractSnippets: true,
};

// Aurora Project Analysis Types (AI-generated)
export interface ProjectAnalysis {
  summary: string;           // AI-generated project summary
  architecture: string;      // Architecture description
  keyFiles: string[];        // Most important files
  techStack: string[];       // Detected technologies
  conventions: string[];     // Code conventions
  generatedAt: Date;
}

// Aurora Project Configuration (stored in .aurora/config.json)
export interface AuroraProjectConfig {
  version: string;           // Config format version
  projectName: string;       // Project display name
  linkedAt: Date;            // When project was first linked
  lastSyncedAt?: Date;       // Last sync with external storage
  settings?: {
    autoAnalyze?: boolean;   // Auto-run AI analysis
    syncEnabled?: boolean;   // Enable sync features
  };
}

// Meeting Index Entry (stored in .aurora/meetings/index.json)
export interface MeetingIndexEntry {
  id: string;
  filename: string;          // e.g., "2024-01-15-standup.json"
  folderName?: string;       // e.g., "2024-01-15-standup" - stored to survive name generation changes
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Project Context Index (stored in .aurora/context/index.json)
export interface ProjectContextIndex {
  rootPath: string;
  name: string;
  totalFiles: number;
  lastIndexedAt: Date;
  fileTree: string[];        // Simplified file paths for quick reference
}

// Related project reference (for multi-project meetings)
export interface RelatedProject {
  path: string;
  name: string;
  linkedAt: Date;
}
