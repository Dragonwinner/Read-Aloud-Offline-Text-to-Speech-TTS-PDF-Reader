<p align="center">
  <img src="https://raw.githubusercontent.com/Dragonwinner/Read-Aloud-Offline-Text-to-Speech-TTS-PDF-Reader/main/media/icon.png" width="128" height="128" alt="Read Aloud Logo" style="border-radius: 24px;" />
</p>

# 🔊 Read Aloud: Offline Text to Speech (TTS) & PDF Reader

> **100% Offline, Privacy-First Neural Voice Reader for PDF, Markdown, and Code with Live Alien Companion.**

![Offline Neural TTS](https://img.shields.io/badge/TTS-100%25%20Offline-brightgreen)
![Zero API Keys](https://img.shields.io/badge/API%20Keys-Zero%20Required-blue)
![Natural Voices](https://img.shields.io/badge/Voices-Neural%20Male%20%26%20Female-orange)
![PDF & Markdown](https://img.shields.io/badge/Supported-PDF%20%7C%20MD%20%7C%20TXT-purple)

**Read Aloud (TTS)** is an ultra-fast, 100% offline VS Code extension that reads **PDF documents (`.pdf`)**, **Markdown notes (`.md`)**, and **Code / Plain Text (`.txt`)** aloud using high-fidelity local neural voices without requiring any API keys or subscriptions.

---

## 🌟 Key Features

* **100% Local & Offline:** Runs entirely on your CPU using local Piper Neural TTS models. No cloud APIs, no subscriptions, zero data leaves your computer.
* **Natural Male & Female Voices:**
  * ♀ **Female Voice:** Amy (`en_US-amy-medium`)
  * ♂ **Male Voice:** Ryan (`en_US-ryan-medium`)
* **Multi-Format Support:**
  * `.txt` / Plain text files
  * `.md` / Markdown files (automatically strips code blocks, URLs, and formatting symbols so it reads smoothly)
  * `.pdf` / PDF documents (extracts text, joins broken hyphens, reconstructs paragraphs)
  * **Selected Text Reading:** Highlight any block of text in your editor and read it instantly.
* **Ultra Low-Latency Streaming:** Sub-200ms time-to-first-sound using sentence chunk pipelining.
* **Active Text Highlighting:** Highlights sentences in the active VS Code editor in real-time as they are read.
* **Audio Controls:** Play, Pause, Resume, Stop, Speed Rate slider (0.5x to 2.0x), and Volume control.

---

## 📸 Visual Showcase

### 🛸 1. Live Document Reading & Cosmo Word Tracker
Cosmo automatically tracks every spoken word with dynamic reticles, waypoint dots, and auto-scrolling sentences.

![Cosmo Live Document Reading Tracker](https://raw.githubusercontent.com/Dragonwinner/Read-Aloud-Offline-Text-to-Speech-TTS-PDF-Reader/main/media/2.png)

### 📊 2. Alien Progress Telemetry
Keep track of your document completion with circular progress gauges and target coordinates.

![Alien Progress Telemetry Sidebar](https://raw.githubusercontent.com/Dragonwinner/Read-Aloud-Offline-Text-to-Speech-TTS-PDF-Reader/main/media/4.png)

### 🎛️ 3. Neural Playback Dock & Audio Waveform
Full playback control dock with animated waveforms, voice narrator info, and sub-1x to 2x speed steps.

![Neural Audio Playback Dock](https://raw.githubusercontent.com/Dragonwinner/Read-Aloud-Offline-Text-to-Speech-TTS-PDF-Reader/main/media/3.png)

---

## 🚀 Quick Start & Usage

### 1. Read Selected Text
1. Highlight any text in your editor.
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) and choose **"ALISHA: Read Selected Text"**, or click the Play icon in the editor title bar.

### 2. Read an Entire File (.txt, .md, .pdf)
1. Open any `.txt`, `.md`, or right-click any `.pdf` in the File Explorer.
2. Select **"ALISHA: Read Current File"**.

### 3. Switch Voice (Male / Female)
* Run command **"ALISHA: Switch Voice (Male / Female)"** or toggle it in the bottom Status Bar.

### 4. Playback Controls
* **Pause / Resume:** Click the Status Bar or run `ALISHA: Pause / Resume`.
* **Stop:** Run `ALISHA: Stop Playback`.

---

## 💡 Why Read Aloud (TTS)?

| Feature | 🔊 Read Aloud (TTS) | 🌐 Cloud TTS Extensions |
| :--- | :--- | :--- |
| **Cost** | **100% Free & Unlimited** | Pay-per-character / API sub |
| **API Keys** | **Zero Required** | Cloud API key needed |
| **Internet Required** | **NO (100% Offline)** | YES (Fails without internet) |
| **Privacy & Security** | **Code & PDFs Never Leave PC** | Sent to third-party cloud servers |
| **Latency** | **Sub-200ms Local Pipelining** | Network upload/download delay |
| **Live Word Tracking** | **Interactive Flying Alien Pet** | None or basic text cursor |
| **PDF Support** | **Built-in text extraction & cleaning** | Often requires copy-paste |

---

## ⌨️ Keyboard Shortcuts & Commands

| Command | Shortcut (Win/Linux) | Shortcut (macOS) | Description |
| :--- | :--- | :--- | :--- |
| `ALISHA: Read Selected Text` | `Alt+R` | `Option+R` | Read highlighted text immediately |
| `ALISHA: Read Current File` | `Ctrl+Alt+R` | `Cmd+Option+R` | Read full PDF, Markdown, or text file |
| `ALISHA: Pause / Resume` | `Alt+P` | `Option+P` | Pause or resume active speech |
| `ALISHA: Stop Playback` | `Alt+S` | `Option+S` | Immediately stop voice playback |
| `ALISHA: Switch Voice` | — | — | Toggle between Female (Amy) and Male (Ryan) |

---

## ⚙️ Configuration Settings

Customize Read Aloud via `settings.json` or Extension Settings UI:

```json
{
  "alishaVoice.gender": "female",               // "female" (Amy) or "male" (Ryan)
  "alishaVoice.speed": 1.0,                     // 0.5x to 2.0x playback rate
  "alishaVoice.highlightActiveText": true,      // Highlight text in editor while reading
  "alishaVoice.skipCodeBlocksInMarkdown": true, // Automatically skip raw code blocks
  "alishaVoice.customPiperPath": ""             // Optional path to custom piper binary
}
```

---

## 🔒 Privacy & Data Security

* **100% Local Execution:** All text-to-speech synthesis and document extraction run entirely on your local machine using local neural models.
* **Zero Telemetry & Zero Cloud Calls:** No code, document contents, reading history, or personal analytics are ever collected, logged, or transmitted to any external servers.
* **Air-Gapped Ready:** Safely usable in high-security, enterprise, or air-gapped offline environments.

---

## 📄 License & Attribution

* Released under the [MIT License](LICENSE).
* Powered by [Piper TTS](https://github.com/rhasspy/piper) (local neural voice synthesis) and [ONNX Runtime](https://github.com/microsoft/onnxruntime).
