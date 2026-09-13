# Complete Implementation Plan: 100% Local Neural Voice Reader for VS Code (Method 2: Piper TTS)

## 1. Executive Summary & Objective
This project implements a **100% offline, privacy-first VS Code extension** capable of reading **Plain Text (`.txt`)**, **Markdown (`.md`)**, and **PDF documents (`.pdf`)** using **natural human-like male and female neural voices**.

* **Core Engine:** Piper Neural TTS (fast VITS/ONNX architecture via C++ local sidecar).
* **Zero Cloud Dependency:** No APIs, no network calls, no telemetry, no subscriptions.
* **Key User Experience:** Instant low-latency playback (sub-200ms time-to-first-sound), sentence-level chunk streaming, editor text highlighting sync, and full playback controls (Play, Pause, Resume, Speed 0.5x-2.0x, Volume).

---

## 2. End-to-End System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   VS Code Environment                                  │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              Input Sources Layer                               │   │
│   │     [Active Text Selection]   |   [.txt File]   |   [.md File]   |   [.pdf File]   │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │                                            │
│                                           ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                        Extraction & Sanitization Layer                         │   │
│   │  • Raw Buffer Extraction (vscode.workspace.fs)                                 │   │
│   │  • Markdown AST Filter (Strips codeblocks, links, syntax via remove-markdown)  │   │
│   │  • PDF Stream Parser (pdf-parse / text stream cleaner & paragraph reconstructor│   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │ (Clean Plain Text)                         │
│                                           ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                         Text Chunking & Queue Manager                          │   │
│   │  • Sentence-level regex tokenizer (bounds: . ? ! \n\n)                         │   │
│   │  • Streaming Audio Queue (Pipelined generation while playing prior chunks)     │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │ (Sentence Chunks)                          │
│                                           ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                     Local Synthesis Engine (Piper Sidecar)                     │   │
│   │  • OS Detection (win32: piper.exe | darwin: piper | linux: piper)              │   │
│   │  • Spawns ChildProcess via Stdin Stream -> Raw PCM/WAV buffer                  │   │
│   │  • Voice Assets: Female (en_US-amy-medium) / Male (en_US-ryan-medium)          │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │ (WAV Audio Buffer / Base64)                │
│                                           ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                   VS Code Webview Audio Controller & UI Layer                  │   │
│   │  • HTML5 Web Audio API Gapless Stream Player (Sidebar or Status Bar Panel)    │   │
│   │  • Controls: Play, Pause, Resume, Stop, Speed Rate (0.5x - 2.0x), Volume       │   │
│   │  • Visual Sync: Text Editor Highlights current reading sentence                │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Breakdown

### 3.1. File Parsing & Text Normalization Layer

#### Plain Text (`.txt`)
* Direct extraction from active editor selection (`editor.document.getText(editor.selection)`) or entire buffer via `vscode.workspace.fs.readFile`.

#### Markdown (`.md`)
* Raw markdown contains syntax (`#`, `**`, `[text](url)`, ` ```code``` `) that sounds unnatural when spoken.
* **Processing Rules:**
  1. Remove frontmatter YAML/TOML headers.
  2. Strip or summarize code blocks (e.g., replace ` ```typescript ... ``` ` with *"Code block omitted"* or speak only inline code).
  3. Strip images, URL links (retaining only link text), and table border formatting.
  4. Use `remove-markdown` or custom AST walker for precise control.

#### PDF Files (`.pdf`)
* Use `pdf-parse` (pure offline JavaScript implementation of Mozilla PDF.js).
* **Text Normalization Strategy:**
  1. Fix hyphenated line breaks (e.g. `imple- \n mentation` $\rightarrow$ `implementation`).
  2. Normalize multi-line paragraph wraps without destroying intentional sentence breaks.
  3. Filter out repetitive headers, footers, and page numbers (`Page X of Y`).

---

### 3.2. Sentence Chunking & Low-Latency Streaming Pipeline

Reading a 50-page PDF at once would take several seconds to synthesize if processed as one giant block.
**Solution: Pipeline Chunking**:

1. Split sanitized text into small sentence units (approx. 100–300 characters each).
2. The queue synthesizes **Chunk 0** and immediately begins playback.
3. While Chunk 0 is playing, the background worker synthesizes **Chunk 1, Chunk 2, Chunk 3**.
4. Result: **Sub-200ms latency** to start listening, regardless of document length.

---

### 3.3. Piper Neural Engine & Voice Models

Piper is an ultra-fast, local neural TTS engine built on VITS and ONNX.

#### 1. Binary Sidecars (`bin/`)
* **Windows (x64):** `bin/win32/piper.exe` + `piper_phonemize.dll` + `onnxruntime.dll`
* **macOS (arm64 / x64):** `bin/darwin/piper`
* **Linux (x64 / arm64):** `bin/linux/piper`

#### 2. Local Voice Model Assets (`voices/`)
* **Female Natural Voice:** `en_US-amy-medium.onnx` + `en_US-amy-medium.onnx.json` (~35 MB)
* **Male Natural Voice:** `en_US-ryan-medium.onnx` + `en_US-ryan-medium.onnx.json` (~35 MB)
* *Optional Extended Voices:* `en_GB-alan-medium` (British Male), `en_GB-alba-medium` (British Female).

#### 3. Execution via Node.js `child_process.spawn`
```typescript
const child = spawn(piperBinaryPath, [
  "--model", voiceModelOnnxPath,
  "--config", voiceModelConfigJsonPath,
  "--output_file", tempWavPath
]);
child.stdin.write(sentenceChunk);
child.stdin.end();
```

---

### 3.4. VS Code Webview Audio Controller

The Extension Host process transmits generated audio buffers to a VS Code Webview provider via `postMessage`.

#### Features in Webview:
* **Gapless Audio Queuing:** Uses `AudioContext` or sequential `<audio>` element buffer loading to ensure zero stutter between sentence chunks.
* **Dynamic Speed Control:** Real-time speed adjustment (0.75x, 1.0x, 1.25x, 1.5x, 2.0x) without re-synthesizing audio (using Web Audio `playbackRate`).
* **Visual Progress Sync:** Returns sentence index callbacks to the Extension Host so it can visually highlight the active sentence in the open text editor.

---

## 4. Directory & Project Structure

```
f:\TEACH\system design\alisha\
├── .vscode/
│   ├── launch.json                   # Debug configuration for Extension testing
│   └── tasks.json                    # Build tasks
├── bin/                              # Pre-built cross-platform Piper binaries
│   ├── win32/
│   │   ├── piper.exe
│   │   ├── piper_phonemize.dll
│   │   └── onnxruntime.dll
│   ├── darwin/
│   │   └── piper
│   └── linux/
│       └── piper
├── voices/                           # Offline ONNX voice models & configs
│   ├── en_US-amy-medium.onnx
│   ├── en_US-amy-medium.onnx.json
│   ├── en_US-ryan-medium.onnx
│   └── en_US-ryan-medium.onnx.json
├── src/
│   ├── extension.ts                  # Entry point, registers commands and status bar
│   ├── types.ts                      # Shared interfaces & configuration types
│   ├── parser/
│   │   ├── fileParser.ts             # Dispatches .txt, .md, and .pdf
│   │   ├── markdownSanitizer.ts      # Strips markdown code/syntax
│   │   └── pdfExtractor.ts           # PDF stream extraction & cleaning
│   ├── tts/
│   │   ├── piperEngine.ts            # Child process manager for Piper
│   │   └── chunker.ts                # Sentence tokenization & queue pipeline
│   ├── player/
│   │   ├── audioPlayerWebview.ts     # Webview panel & Web Audio API bridge
│   │   └── editorHighlighter.ts      # Visual editor text decoration sync
│   └── ui/
│       ├── statusBar.ts              # Play/Pause/Stop/Voice Status Bar Item
│       └── webviewHtml.ts            # Webview UI markup & JS audio controller
├── media/
│   ├── player.css                    # Audio player styles (matches VS Code theme)
│   └── icons/                        # Action icons
├── package.json                      # Manifest, commands, configuration settings
├── tsconfig.json                     # TypeScript compiler configuration
└── README.md                         # Documentation & user instructions
```

---

## 5. Configuration Schema (`package.json`)

```json
{
  "name": "alisha-local-voice-reader",
  "displayName": "Alisha - 100% Offline Local Voice Reader",
  "description": "Read Text, Markdown, and PDF files with natural offline male and female neural voices.",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other", "Accessibility"],
  "activationEvents": [
    "onCommand:alishaVoice.readSelection",
    "onCommand:alishaVoice.readFile"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "alishaVoice.readSelection",
        "title": "Alisha Voice: Read Selected Text",
        "icon": "$(play)"
      },
      {
        "command": "alishaVoice.readFile",
        "title": "Alisha Voice: Read Current File (.txt, .md, .pdf)",
        "icon": "$(book)"
      },
      {
        "command": "alishaVoice.pauseResume",
        "title": "Alisha Voice: Pause / Resume",
        "icon": "$(debug-pause)"
      },
      {
        "command": "alishaVoice.stop",
        "title": "Alisha Voice: Stop Playback",
        "icon": "$(debug-stop)"
      },
      {
        "command": "alishaVoice.toggleVoice",
        "title": "Alisha Voice: Switch Male / Female Voice"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "alishaVoice.readSelection",
          "group": "navigation@10",
          "when": "editorHasSelection"
        },
        {
          "command": "alishaVoice.readFile",
          "group": "navigation@11"
        }
      ],
      "explorer/context": [
        {
          "command": "alishaVoice.readFile",
          "group": "navigation@10",
          "when": "resourceExtname =~ /\\.(txt|md|pdf)$/i"
        }
      ]
    },
    "configuration": {
      "title": "Alisha Local Voice Reader",
      "properties": {
        "alishaVoice.gender": {
          "type": "string",
          "enum": ["female", "male"],
          "default": "female",
          "description": "Select default natural voice (Female: Amy, Male: Ryan)."
        },
        "alishaVoice.speed": {
          "type": "number",
          "default": 1.0,
          "minimum": 0.5,
          "maximum": 2.0,
          "description": "Default speech playback rate."
        },
        "alishaVoice.highlightActiveText": {
          "type": "boolean",
          "default": true,
          "description": "Highlight sentences in the editor as they are read aloud."
        },
        "alishaVoice.skipCodeBlocksInMarkdown": {
          "type": "boolean",
          "default": true,
          "description": "Skip reading code blocks inside Markdown files."
        }
      }
    }
  }
}
```

---

## 6. Implementation Stages & Milestones

### Phase 1: Environment Setup & Core Dependencies
1. Initialize TypeScript VS Code extension project structure.
2. Install offline npm dependencies:
   * `pdf-parse`: Local PDF text extractor.
   * `remove-markdown`: Clean markdown syntax stripping.
3. Configure `tsconfig.json` and build scripts.

### Phase 2: Binary & Voice Model Packaging
1. Download standalone Piper binaries for Windows, macOS, and Linux from official Piper releases.
2. Place binaries under `bin/{platform}/`.
3. Download ONNX medium models for:
   * `en_US-amy-medium` (Female)
   * `en_US-ryan-medium` (Male)
4. Verify local execution via Node.js `child_process.spawn` across sample strings.

### Phase 3: Text Extractors & Chunker Pipeline
1. Implement `src/parser/fileParser.ts`:
   * Text reader from active editor and workspace files.
   * Markdown AST sanitizer with code-block handling.
   * PDF stream cleaner (hyphenation joiner and paragraph builder).
2. Implement `src/tts/chunker.ts`:
   * Sentence boundary detection (splits on `. `, `? `, `! `, and newlines).
   * Streaming queue to process chunks sequentially with pre-buffering.

### Phase 4: Webview Audio Player & Visual Sync
1. Create `src/player/audioPlayerWebview.ts` with HTML5 Web Audio API.
2. Implement message passing:
   * `EXTENSION -> WEBVIEW`: `enqueueChunk(audioBase64, chunkIndex, rate)`
   * `WEBVIEW -> EXTENSION`: `onChunkStarted(chunkIndex)`, `onPlaybackFinished()`
3. Implement `src/player/editorHighlighter.ts` using `vscode.window.createTextEditorDecorationType` to highlight sentences in real-time.

### Phase 5: UI, Status Bar, & Commands
1. Implement `src/ui/statusBar.ts`:
   * Displays playback state (`$(play) Playing`, `$(debug-pause) Paused`).
   * Quick-switch button for Male / Female voices.
2. Register context menu options in Explorer and Editor.

---

## 7. Verification & Testing Strategy

| Test Area | Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **Offline Integrity** | Disconnect Wi-Fi/Ethernet and execute all commands | 100% functional, zero network errors. |
| **.txt Support** | Read selected paragraph & entire 500-line text file | Immediate playback, accurate word pronunciation. |
| **.md Support** | Read markdown file with tables, headers, code blocks | Ignores markdown symbols (`#`, `**`), reads clean text. |
| **.pdf Support** | Read multi-page research paper PDF | Correctly extracts text, strips page numbers, no stutter. |
| **Voice Switching** | Switch between Male (Ryan) and Female (Amy) | Instant switch on next speech chunk. |
| **Controls** | Click Pause, Resume, Stop, and change Speed to 1.5x | Responsive audio control with zero desync. |
| **Highlighting** | Read long document in active editor | Editor scrolls and highlights matching current sentence. |

---

## 8. Summary of Benefits of Method 2
* **Zero Cost:** Absolutely free forever.
* **100% Private:** Sensitive code, private documents, and internal PDFs never leave your machine.
* **Ultra Fast:** Real-time factor < 0.1x (1 second of audio generates in under 100ms on CPU).
* **High Quality:** Natural neural speech without the robotic tone of legacy OS synthesizers.
