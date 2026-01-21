# Aurora Voice

Transform voice into intelligent, structured outputs.

Aurora Voice is a desktop application that captures your voice recordings and transforms them into structured, AI-enriched content. Whether you're taking quick notes, documenting a meeting, or describing code concepts, Aurora Voice transcribes your speech and enriches it with intelligent formatting and insights.

## The Problem

Voice recordings are fast to create but slow to process. Transcription alone isn't enough - raw transcripts need structure, summarization, and context-aware formatting to be useful. Aurora Voice solves this by providing an end-to-end pipeline from voice to polished, actionable output.

**Use Cases:**
- **Quick Notes:** Dictate thoughts and get back structured, highlighted notes
- **Meeting Documentation:** Record discussions, get summaries with action items, decisions, and open questions
- **Code Documentation:** Describe code verbally and receive formatted explanations with syntax-highlighted snippets

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Tauri 2 |
| Frontend | Next.js 16 + React 19 |
| Styling | Tailwind CSS 4 |
| State | Zustand |
| Database | Dexie (IndexedDB) |
| Transcription | OpenAI Whisper API |
| Enrichment | Multi-Provider LLM (OpenAI, Anthropic, Ollama) |

### Voice Pipeline

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌────────────────┐
│  Recording  │ -> │  Transcription   │ -> │   Enrichment    │ -> │   Structured   │
│  (MediaRecorder)   (OpenAI Whisper)      (GPT-4o/Claude/      │    Output      │
│             │    │                  │    │    Ollama)      │    │  (Markdown)    │
└─────────────┘    └──────────────────┘    └─────────────────┘    └────────────────┘
     Hotkey           128kbps webm            Streaming             Copy/Download
```

### Key Components

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Voice Mode - Main UI with recording orb, Quick-Start form |
| `src/lib/audio/recorder.ts` | Audio capture via MediaRecorder API, WAV conversion |
| `src/lib/ai/transcribe.ts` | OpenAI Whisper integration with timeout handling |
| `src/lib/ai/enrich.ts` | Multi-provider LLM streaming (OpenAI, Anthropic, Ollama) |
| `src/hooks/use-hotkey.ts` | Global keyboard shortcut handler |
| `src/lib/store/settings.ts` | Zustand state management |
| `src/lib/store/meeting-store.ts` | Meeting session persistence |

## Setup

### Prerequisites

- **Node.js** 20+
- **Rust** (latest stable)
- **Tauri CLI** (`npm install -g @tauri-apps/cli` or via `cargo install tauri-cli`)
- **Platform-specific dependencies:**
  - macOS: Xcode Command Line Tools
  - Linux: `webkit2gtk`, `libappindicator`, `librsvg`
  - Windows: Microsoft Visual Studio C++ Build Tools, WebView2

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd aurora-voice

# Install dependencies
npm install
```

### API Key Configuration

Aurora Voice requires API keys for transcription and enrichment:

1. **OpenAI API Key** (Required for transcription)
   - Get your key at [platform.openai.com](https://platform.openai.com)
   - Used for Whisper transcription and optionally GPT-4o enrichment

2. **Anthropic API Key** (Optional)
   - Get your key at [console.anthropic.com](https://console.anthropic.com)
   - For Claude-based enrichment

3. **Ollama** (Optional, for local inference)
   - Install from [ollama.ai](https://ollama.ai)
   - Default endpoint: `http://localhost:11434`

API keys are configured in the app's Settings panel (gear icon).

### Development

```bash
# Start Tauri development server
npm run tauri:dev
```

This runs the Next.js dev server with Turbopack and launches the Tauri window.

### Build

```bash
# Production build
npm run tauri:build
```

Output bundles are created in `src-tauri/target/release/bundle/`:
- macOS: `.dmg`, `.app`
- Windows: `.msi`, `.exe`
- Linux: `.deb`, `.AppImage`

## Design Decisions

### Why Tauri over Electron?

| Aspect | Tauri | Electron |
|--------|-------|----------|
| Bundle Size | ~10 MB | ~150+ MB |
| Memory Usage | ~50 MB | ~200+ MB |
| Native APIs | Rust plugins | Node.js bridge |
| Security | Sandboxed by default | Full Node access |

Tauri uses the system WebView instead of bundling Chromium, resulting in significantly smaller bundle sizes and lower memory footprint. Rust plugins provide secure access to native APIs like global shortcuts and file system.

### Why Multi-Provider LLM?

The enrichment pipeline supports multiple LLM providers for:

1. **Flexibility:** Users can choose their preferred provider
2. **Cost Control:** Switch between GPT-4o, GPT-4o-mini, or local Ollama
3. **Privacy:** Ollama enables fully offline, local-only processing
4. **Fallback:** If one provider is down, switch to another

Supported models:
- **OpenAI:** GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo
- **Anthropic:** Claude Opus 4, Claude Sonnet 4, Claude 3.5 Haiku
- **Ollama:** Llama 3.2, Llama 3.1, Mistral, Mixtral, CodeLlama

### Why Streaming?

The AI SDK's `streamText` function streams responses token-by-token:

- **Faster perceived response time:** Output appears immediately
- **Better UX:** Users see progress instead of waiting for complete response
- **Interruptible:** Can stop generation early if needed

### Hotkey System Architecture

Global hotkeys are implemented in two layers:

1. **Tauri Layer:** `tauri-plugin-global-shortcut` registers system-wide shortcuts
2. **React Layer:** `use-hotkey.ts` handles in-app keyboard events

Default hotkey: `Cmd/Ctrl + Shift + Space`

The hotkey handler uses refs to avoid recreating event listeners on callback changes, ensuring stable performance during rapid key presses.

## Features

### 3 Enrichment Modes

| Mode | Output |
|------|--------|
| **Smart Notes** | Structured notes with headings, bullet points, and highlights |
| **Meeting Summary** | Overview, key points, action items, decisions, open questions |
| **Code Assistant** | Code explanations, snippets with syntax highlighting, improvement suggestions |

### Meeting Management

- **Quick-Start Form:** Set title, participants, and project folder before recording
- **Speaker Management:** Track and manage meeting participants
- **Transcript Segmentation:** Audio segments with timestamps
- **Structured Parsing:** Auto-extracts decisions, action items, and open questions from AI output

### Project Integration

- **Folder Selection:** Associate recordings with project directories via native file dialog
- **Export:** Download enriched content as Markdown files
- **History:** Browse past recordings and outputs

### Additional Features

- **Audio Level Visualization:** Real-time waveform feedback during recording
- **Copy to Clipboard:** One-click copy of enriched output
- **Cross-Platform Audio:** Automatic WebM-to-WAV conversion for Safari compatibility
- **Configurable Language:** Auto-detect or specify transcription language

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (web only) |
| `npm run build` | Build Next.js for production |
| `npm run tauri:dev` | Start Tauri development with hot reload |
| `npm run tauri:build` | Build production desktop app |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

## Project Structure

```
aurora-voice/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   │   ├── ui/           # Reusable UI components
│   │   └── output/       # Output display components
│   ├── hooks/            # Custom React hooks
│   ├── lib/
│   │   ├── ai/           # LLM integration (transcribe, enrich)
│   │   ├── audio/        # Audio recording utilities
│   │   └── store/        # Zustand state stores
│   └── types/            # TypeScript type definitions
├── src-tauri/
│   ├── src/              # Rust source code
│   ├── icons/            # App icons
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
└── package.json
```

## License

MIT
