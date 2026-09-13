import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseDocumentSource, ParsedDocument } from "./parser/fileParser";
import { chunkTextIntoSentences } from "./tts/chunker";
import { PiperEngine } from "./tts/piperEngine";
import { NativeAudioPlayer } from "./player/nativeAudioPlayer";
import { AlienPetTracker } from "./player/alienPetTracker";
import { AlienPetWebview } from "./player/alienPetWebview";
import { AlishaStatusBar } from "./ui/statusBar";
import { ModelSetupManager } from "./tts/modelSetup";
import { AlishaHoverProvider } from "./ui/hoverProvider";
import { VoiceGender, TextChunk } from "./types";

let piperEngine: PiperEngine;
let audioPlayer: NativeAudioPlayer;
let alienTracker: AlienPetTracker;
let alienPetWebview: AlienPetWebview;
let statusBar: AlishaStatusBar;
let modelSetup: ModelSetupManager;

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

const chunkTimingMap = new Map<number, { durationMs: number; wordTimings: WordTiming[] }>();

function getWavDurationMs(wavPath: string): number {
  try {
    const stats = fs.statSync(wavPath);
    const buffer = Buffer.alloc(44);
    const fd = fs.openSync(wavPath, "r");
    fs.readSync(fd, buffer, 0, 44, 0);
    fs.closeSync(fd);

    const sampleRate = buffer.readUInt32LE(24) || 22050;
    const numChannels = buffer.readUInt16LE(22) || 1;
    const bitsPerSample = buffer.readUInt16LE(34) || 16;

    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const dataSize = Math.max(0, stats.size - 44);
    const durationSec = dataSize / (byteRate || 44100);
    // Piper already synthesized with --length_scale, so the WAV byte length reflects exact physical duration
    return Math.max(400, Math.round(durationSec * 1000));
  } catch (e) {
    return 2000;
  }
}

function calculateWordTimings(text: string, totalDurationMs: number): WordTiming[] {
  const rawWords = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (rawWords.length === 0) return [];

  const weights = rawWords.map((w) => {
    let cleanLen = w.replace(/[^a-zA-Z0-9]/g, "").length;
    cleanLen = Math.max(1, cleanLen);
    if (cleanLen <= 3) cleanLen *= 0.85;

    if (w.endsWith(",") || w.endsWith(";") || w.endsWith(":")) {
      cleanLen += 2.5;
    } else if (w.endsWith(".") || w.endsWith("!") || w.endsWith("?")) {
      cleanLen += 4.5;
    } else if (w.endsWith("...") || w.endsWith("—") || w.endsWith("-")) {
      cleanLen += 3.0;
    }
    return cleanLen;
  });

  const totalWeight = weights.reduce((acc, v) => acc + v, 0);
  let currentMs = 0;
  const timings: WordTiming[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const wordDur = Math.round((weights[i] / totalWeight) * totalDurationMs);
    const startMs = currentMs;
    const endMs = i === rawWords.length - 1 ? totalDurationMs : Math.min(totalDurationMs, currentMs + wordDur);
    timings.push({
      word: rawWords[i],
      startMs,
      endMs
    });
    currentMs = endMs;
  }

  return timings;
}

let activeChunks: TextChunk[] = [];
let isReadingActive = false;
let cancellationTokenSource: vscode.CancellationTokenSource | null = null;
let currentDocumentName = "";
let currentReadingChunkIndex = 0;

let autoReadOnCopy = false;
let lastClipboardText = "";
let clipboardWatcher: NodeJS.Timeout | null = null;
let currentPlaybackSpeed: number = 1.0;

export function activate(context: vscode.ExtensionContext) {
  console.log("Activating ALISHA - DOCS Reader (100% Local with Cute Alien Pet).");

  alienTracker = new AlienPetTracker();
  alienPetWebview = new AlienPetWebview(context.extensionUri, {
    onJumpToChunk: (chunkIndex: number) => {
      jumpToChunk(chunkIndex);
    },
    onRequestDoc: () => {
      sendActiveDocToWebview();
    },
    onStartRead: () => {
      vscode.commands.executeCommand("alishaVoice.readFile");
    },
    onSetSpeed: (speed: number) => {
      setPlaybackSpeed(speed);
    }
  });
  statusBar = new AlishaStatusBar();
  piperEngine = new PiperEngine(context);
  modelSetup = new ModelSetupManager(context, piperEngine);

  // Initialize voice gender and speed from settings
  const config = vscode.workspace.getConfiguration("alishaVoice");
  const initialGender = config.get<VoiceGender>("gender", "female");
  currentPlaybackSpeed = config.get<number>("speed", 1.0);
  alienPetWebview.setSpeed(currentPlaybackSpeed);
  statusBar.setGender(initialGender);

  // Check and auto-download voice models if needed on startup
  setTimeout(() => {
    modelSetup.autoCheckAndDownloadOnStartup();
  }, 1000);

  audioPlayer = new NativeAudioPlayer(context, {
    onChunkStarted: (chunkIndex: number) => {
      currentReadingChunkIndex = chunkIndex;
      const chunk = activeChunks.find((c) => c.index === chunkIndex);
      if (chunk) {
        // Alien pet flies to the current sentence in the editor
        alienTracker.trackChunk(chunk);

        const timing = chunkTimingMap.get(chunkIndex) || {
          durationMs: Math.max(1200, chunk.text.split(/\s+/).length * 320),
          wordTimings: calculateWordTimings(chunk.text, Math.max(1200, chunk.text.split(/\s+/).length * 320))
        };

        // Real-time word-level synchronization with the audio player!
        alienPetWebview.startChunkSpeech(
          chunkIndex,
          chunk.text,
          timing.wordTimings,
          timing.durationMs,
          activeChunks.length
        );
      }
    },
    onChunkEnded: (chunkIndex: number) => {
      // Prepared for next chunk
    },
    onPlaybackFinished: () => {
      isReadingActive = false;
      alienTracker.setStatus("finished");
      alienPetWebview.updateState("stopped");
      statusBar.setStatus("idle");
    },
    onStateChange: (state: "playing" | "paused" | "stopped") => {
      if (state === "playing") {
        statusBar.setStatus("playing");
        alienPetWebview.updateState("playing");
      } else if (state === "paused") {
        statusBar.setStatus("paused");
        alienTracker.setStatus("paused");
        alienPetWebview.updateState("paused");
      } else {
        statusBar.setStatus("stopped");
        alienTracker.setStatus("stopped");
        alienPetWebview.updateState("stopped");
      }
    }
  });

  // Register Cosmo Companion for Activity Bar Sidebar View
  const sidebarViewSub = vscode.window.registerWebviewViewProvider(
    AlienPetWebview.viewType,
    alienPetWebview
  );
  context.subscriptions.push(sidebarViewSub);

  // Keep Cosmo companion text synchronized when user switches documents (including PDF tabs)
  const editorChangeSub = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!isReadingActive && editor) {
      await sendActiveDocToWebview();
    }
  });
  context.subscriptions.push(editorChangeSub);

  if (vscode.window.tabGroups) {
    const tabChangeSub = vscode.window.tabGroups.onDidChangeTabs(async () => {
      if (!isReadingActive) {
        await sendActiveDocToWebview();
      }
    });
    context.subscriptions.push(tabChangeSub);
  }

  // 1. Command: Read Selected Text (Supports Text Editor & PDF Webview)
  const readSelectionCmd = vscode.commands.registerCommand("alishaVoice.readSelection", async () => {
    const editor = vscode.window.activeTextEditor;
    let selectedText = "";
    let baseOffset = 0;

    if (editor && !editor.selection.isEmpty) {
      selectedText = editor.document.getText(editor.selection);
      baseOffset = editor.document.offsetAt(editor.selection.start);
      alienTracker.setEditor(editor);
      alienTracker.setBaseOffset(baseOffset);
    } else {
      // PDF viewer, webview, or no active text editor:
      // Read copied text from clipboard
      const clipText = (await vscode.env.clipboard.readText()).trim();
      if (clipText) {
        selectedText = clipText;
        vscode.window.showInformationMessage(`ALISHA: Reading selected text from PDF/clipboard...`);
      }
    }

    if (!selectedText || !selectedText.trim()) {
      vscode.window.showInformationMessage(
        "No text selected. In a PDF: Highlight text, press Ctrl+C (or right-click -> Copy), then press Alt+R."
      );
      return;
    }

    await startReadingWorkflow(undefined, selectedText, baseOffset);
  });

  // 2. Command: Read From Cursor
  const readFromCursorCmd = vscode.commands.registerCommand("alishaVoice.readFromCursor", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor open.");
      return;
    }

    const position = editor.selection.active;
    const doc = editor.document;
    const baseOffset = doc.offsetAt(position);
    const fullText = doc.getText();
    const remainingText = fullText.substring(baseOffset);

    if (!remainingText || !remainingText.trim()) {
      vscode.window.showInformationMessage("No readable text found after current cursor position.");
      return;
    }

    alienTracker.setEditor(editor);
    alienTracker.setBaseOffset(baseOffset);
    await startReadingWorkflow(undefined, remainingText, baseOffset);
  });

  // 3. Command: Read Entire File (.txt, .md, .pdf)
  const readFileCmd = vscode.commands.registerCommand("alishaVoice.readFile", async (uri?: vscode.Uri) => {
    const targetUri = uri || getActiveDocumentUri();
    if (!targetUri) {
      vscode.window.showWarningMessage("Please open or right-click a .txt, .md, or .pdf file.");
      return;
    }

    alienTracker.setEditor(vscode.window.activeTextEditor);
    alienTracker.setBaseOffset(0);
    await startReadingWorkflow(targetUri, undefined, 0);
  });

  // 4. Command: Pause / Resume
  const pauseResumeCmd = vscode.commands.registerCommand("alishaVoice.pauseResume", () => {
    if (isReadingActive) {
      if (audioPlayer.getIsPaused()) {
        audioPlayer.resume();
      } else {
        audioPlayer.pause();
      }
    } else {
      if (activeChunks.length > 0) {
        jumpToChunk(currentReadingChunkIndex || 0);
      } else {
        vscode.commands.executeCommand("alishaVoice.readFile");
      }
    }
  });

  // 5. Command: Stop Playback
  const stopCmd = vscode.commands.registerCommand("alishaVoice.stop", () => {
    stopCurrentPlayback();
  });

  // 6. Command: Toggle Voice Gender (Male / Female)
  const toggleVoiceCmd = vscode.commands.registerCommand("alishaVoice.toggleVoice", async () => {
    const config = vscode.workspace.getConfiguration("alishaVoice");
    const current = config.get<VoiceGender>("gender", "female");
    const nextGender: VoiceGender = current === "female" ? "male" : "female";

    await config.update("gender", nextGender, vscode.ConfigurationTarget.Global);
    statusBar.setGender(nextGender);
    vscode.window.showInformationMessage(`ALISHA Voice set to: ${nextGender === "female" ? "Female (Amy)" : "Male (Ryan)"}`);
  });

  // 7. Command: Toggle Auto-Read on Copy (PDF Mode)
  const toggleAutoReadCmd = vscode.commands.registerCommand("alishaVoice.toggleAutoReadOnCopy", async () => {
    autoReadOnCopy = !autoReadOnCopy;
    if (autoReadOnCopy) {
      lastClipboardText = (await vscode.env.clipboard.readText()).trim();
      startClipboardWatcher();
      vscode.window.showInformationMessage(
        "🔊 ALISHA: Auto-Read on Copy (PDF Mode) is ON! In your PDF, highlight any text and press Ctrl+C (or Copy) to listen."
      );
    } else {
      stopClipboardWatcher();
      vscode.window.showInformationMessage("🔊 ALISHA: Auto-Read on Copy is now OFF.");
    }
  });

  // 8. Command: Open Cute Alien Pet Companion (Cosmo)
  const toggleAlienPetCmd = vscode.commands.registerCommand("alishaVoice.toggleAlienPet", () => {
    alienPetWebview.showOrToggle();
  });

  // 9. Command: Show Quick Actions Menu
  const showMenuCmd = vscode.commands.registerCommand("alishaVoice.showMenu", async () => {
    const config = vscode.workspace.getConfiguration("alishaVoice");
    const currentGender = config.get<VoiceGender>("gender", "female");
    const voiceLabel = currentGender === "female" ? "Female (Amy)" : "Male (Ryan)";

    const items: vscode.QuickPickItem[] = [
      {
        label: "$(play) Read Selected Text",
        description: "Alt+R",
        detail: "Read highlighted text from Editor or PDF (copied text)"
      },
      {
        label: "$(heart) Open Cute Alien Pet Companion (Cosmo)",
        detail: "Open the interactive flying alien pet sidecar window"
      },
      {
        label: autoReadOnCopy ? "$(check) Auto-Read on Copy (PDF Mode): ON" : "$(circle-slash) Auto-Read on Copy (PDF Mode): OFF",
        description: "Alt+C",
        detail: "Automatically speaks any text you copy in a PDF"
      },
      {
        label: "$(book) Read Current File / PDF",
        detail: "Read active document completely from top to bottom"
      },
      {
        label: "$(debug-pause) Pause / Resume",
        description: "Alt+P",
        detail: "Toggle playback"
      },
      {
        label: "$(debug-stop) Stop Playback",
        description: "Alt+S",
        detail: "Immediately halt voice playback"
      },
      {
        label: `$(account) Switch Voice (Current: ${voiceLabel})`,
        detail: "Switch between natural Female (Amy) and Male (Ryan) voice"
      },
      {
        label: `$(dashboard) Playback Speed (Current: ${currentPlaybackSpeed}x)`,
        detail: "Change reading speed (supports 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x)"
      }
    ];

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: "ALISHA Voice Reader — Select an action"
    });

    if (!pick) return;

    if (pick.label.includes("Read Selected Text")) {
      vscode.commands.executeCommand("alishaVoice.readSelection");
    } else if (pick.label.includes("Open Cute Alien Pet")) {
      vscode.commands.executeCommand("alishaVoice.toggleAlienPet");
    } else if (pick.label.includes("Auto-Read on Copy")) {
      vscode.commands.executeCommand("alishaVoice.toggleAutoReadOnCopy");
    } else if (pick.label.includes("Read Current File")) {
      vscode.commands.executeCommand("alishaVoice.readFile");
    } else if (pick.label.includes("Pause / Resume")) {
      vscode.commands.executeCommand("alishaVoice.pauseResume");
    } else if (pick.label.includes("Stop Playback")) {
      vscode.commands.executeCommand("alishaVoice.stop");
    } else if (pick.label.includes("Switch Voice")) {
      vscode.commands.executeCommand("alishaVoice.toggleVoice");
    } else if (pick.label.includes("Playback Speed")) {
      vscode.commands.executeCommand("alishaVoice.setSpeed");
    }
  });

  // 10. Command: Set Speech Playback Speed
  const setSpeedCmd = vscode.commands.registerCommand("alishaVoice.setSpeed", async () => {
    const speedOptions = [
      { label: "0.5x", description: "Half speed (Slowest, clearest speech)" },
      { label: "0.75x", description: "Slow pacing" },
      { label: "0.85x", description: "Relaxed pacing" },
      { label: "1.0x", description: "Normal speed (Default)" },
      { label: "1.25x", description: "Brisk pacing" },
      { label: "1.5x", description: "Fast" },
      { label: "1.75x", description: "Very fast" },
      { label: "2.0x", description: "Double speed" }
    ];

    const pick = await vscode.window.showQuickPick(speedOptions, {
      placeHolder: `Select playback speed (Current: ${currentPlaybackSpeed}x)`
    });

    if (pick) {
      const speedVal = parseFloat(pick.label.replace("x", ""));
      if (!isNaN(speedVal)) {
        await setPlaybackSpeed(speedVal);
      }
    }
  });

  // 11. Command: Setup Offline Voice Models
  const setupModelsCmd = vscode.commands.registerCommand("alishaVoice.setupModels", async () => {
    await modelSetup.downloadOfflineAssets(false);
  });

  // 12. Register On-Hover Provider for text documents
  const hoverProvider = vscode.languages.registerHoverProvider(
    [
      { scheme: "file" },
      { scheme: "untitled" }
    ],
    new AlishaHoverProvider()
  );

  context.subscriptions.push(
    readSelectionCmd,
    readFromCursorCmd,
    readFileCmd,
    pauseResumeCmd,
    stopCmd,
    toggleVoiceCmd,
    toggleAutoReadCmd,
    toggleAlienPetCmd,
    showMenuCmd,
    setSpeedCmd,
    setupModelsCmd,
    hoverProvider,
    statusBar,
    alienTracker
  );
}

export async function setPlaybackSpeed(newSpeed: number) {
  currentPlaybackSpeed = Math.max(0.3, Math.min(3.0, newSpeed));
  const config = vscode.workspace.getConfiguration("alishaVoice");
  await config.update("speed", currentPlaybackSpeed, vscode.ConfigurationTarget.Global);
  if (audioPlayer) {
    audioPlayer.setSpeed(currentPlaybackSpeed);
  }
  if (alienPetWebview) {
    alienPetWebview.setSpeed(currentPlaybackSpeed);
  }
  vscode.window.setStatusBarMessage(`ALISHA Voice Speed: ${currentPlaybackSpeed}x`, 2500);
}

function startClipboardWatcher() {
  if (clipboardWatcher) return;
  clipboardWatcher = setInterval(async () => {
    if (!autoReadOnCopy) return;
    try {
      const text = (await vscode.env.clipboard.readText()).trim();
      if (text && text !== lastClipboardText && text.length > 5) {
        lastClipboardText = text;
        vscode.window.showInformationMessage(`ALISHA (PDF Auto-Read): "${text.substring(0, 35)}..."`);
        await startReadingWorkflow(undefined, text, 0);
      }
    } catch {}
  }, 600);
}

function stopClipboardWatcher() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
}

export function getActiveDocumentUri(): vscode.Uri | undefined {
  if (vscode.window.activeTextEditor?.document?.uri) {
    return vscode.window.activeTextEditor.document.uri;
  }

  const tabGroups = vscode.window.tabGroups;
  if (!tabGroups) return undefined;

  // 1. Check active tab of active group
  const activeTab = tabGroups.activeTabGroup?.activeTab;
  if (activeTab && activeTab.input) {
    const input = activeTab.input as any;
    if (input.uri instanceof vscode.Uri) return input.uri;
    if (input.resource instanceof vscode.Uri) return input.resource;
    if (input.modified instanceof vscode.Uri) return input.modified;
  }

  // 2. Check all tabs in activeTabGroup
  if (tabGroups.activeTabGroup?.tabs) {
    for (const tab of tabGroups.activeTabGroup.tabs) {
      if (tab.isActive && tab.input) {
        const input = tab.input as any;
        if (input.uri instanceof vscode.Uri) return input.uri;
        if (input.resource instanceof vscode.Uri) return input.resource;
        if (input.modified instanceof vscode.Uri) return input.modified;
      }
    }
  }

  // 3. Fallback: Check any open tab with a file URI
  for (const group of tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.isActive && tab.input) {
        const input = tab.input as any;
        if (input.uri instanceof vscode.Uri && input.uri.scheme === "file") return input.uri;
        if (input.resource instanceof vscode.Uri && input.resource.scheme === "file") return input.resource;
      }
    }
  }

  return undefined;
}

async function startReadingWorkflow(
  targetUri?: vscode.Uri,
  selectedText?: string,
  baseDocOffset: number = 0,
  startFromChunkIndex: number = 0
) {
  stopCurrentPlayback();

  const config = vscode.workspace.getConfiguration("alishaVoice");
  const gender = config.get<VoiceGender>("gender", "female");
  const speed = config.get<number>("speed", 1.0);
  const skipCodeBlocks = config.get<boolean>("skipCodeBlocksInMarkdown", true);

  // Check if offline models are currently downloading or missing
  if (modelSetup.isDownloadingNow()) {
    vscode.window.showInformationMessage("ALISHA: Voice models are currently downloading in the background. Playback will be ready in a few moments.");
    return;
  }

  if (!modelSetup.isEverythingReady()) {
    statusBar.setStatus("buffering");
    const downloaded = await modelSetup.downloadOfflineAssets(false);
    if (!downloaded) {
      statusBar.setStatus("idle");
      return;
    }
  }

  cancellationTokenSource = new vscode.CancellationTokenSource();
  const token = cancellationTokenSource.token;

  statusBar.setStatus("buffering");
  alienTracker.setEditor(vscode.window.activeTextEditor);
  alienTracker.setBaseOffset(baseDocOffset);

  try {
    // 1. Parse document source
    const parsedDoc: ParsedDocument = await parseDocumentSource(targetUri, selectedText, skipCodeBlocks);
    if (!parsedDoc.speechText.trim()) {
      vscode.window.showWarningMessage("Document contains no readable text.");
      statusBar.setStatus("idle");
      return;
    }

    // 2. Chunk text into sentences for low-latency streaming
    activeChunks = chunkTextIntoSentences(parsedDoc.speechText);
    if (activeChunks.length === 0) {
      vscode.window.showWarningMessage("No sentences parsed.");
      statusBar.setStatus("idle");
      return;
    }

    currentDocumentName = parsedDoc.fileName;
    currentReadingChunkIndex = startFromChunkIndex;

    // Load full document into Cosmo's screen so ALL text appears and alien follows along
    alienPetWebview.loadDocument(
      parsedDoc.fileName,
      activeChunks.map((c) => ({ index: c.index, text: c.text })),
      startFromChunkIndex
    );

    alienTracker.setTotalChunks(activeChunks.length);
    isReadingActive = true;
    audioPlayer.clearQueue();

    // 3. Pipeline Streaming: Synthesize from startFromChunkIndex
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `ALISHA: Reading ${parsedDoc.fileName}...`,
      cancellable: true
    }, async (progress, userProgressToken) => {
      userProgressToken.onCancellationRequested(() => {
        stopCurrentPlayback();
      });

      for (let i = startFromChunkIndex; i < activeChunks.length; i++) {
        if (token.isCancellationRequested || !isReadingActive) {
          break;
        }

        const chunk = activeChunks[i];
        progress.report({
          message: `Sentence ${i + 1}/${activeChunks.length}: "${chunk.text.substring(0, 30)}..."`
        });

        try {
          const wavPath = await piperEngine.synthesizeChunkToWavFile(chunk.text, gender, speed);
          if (token.isCancellationRequested || !isReadingActive) {
            try {
              if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
            } catch {}
            break;
          }

          const durationMs = getWavDurationMs(wavPath);
          const wordTimings = calculateWordTimings(chunk.text, durationMs);
          chunkTimingMap.set(chunk.index, { durationMs, wordTimings });

          audioPlayer.enqueueChunk(wavPath, chunk.index, speed);
        } catch (synthErr: any) {
          console.error(`Error synthesizing chunk ${i}:`, synthErr);
        }
      }
    });

  } catch (err: any) {
    vscode.window.showErrorMessage(`ALISHA Error: ${err.message}`);
    stopCurrentPlayback();
  }
}

async function jumpToChunk(targetIndex: number) {
  if (targetIndex < 0) return;

  if (activeChunks.length === 0) {
    await startReadingWorkflow(undefined, undefined, 0, targetIndex);
    return;
  }

  if (targetIndex >= activeChunks.length) return;

  currentReadingChunkIndex = targetIndex;

  if (cancellationTokenSource) {
    cancellationTokenSource.cancel();
    cancellationTokenSource.dispose();
    cancellationTokenSource = null;
  }
  cancellationTokenSource = new vscode.CancellationTokenSource();
  const token = cancellationTokenSource.token;

  audioPlayer.clearQueue();
  audioPlayer.stop();

  isReadingActive = true;
  statusBar.setStatus("buffering");

  const chunk = activeChunks[targetIndex];
  alienTracker.trackChunk(chunk);
  alienPetWebview.updateReadingChunk(chunk.text, targetIndex, activeChunks.length);
  alienPetWebview.updateState("playing");

  const config = vscode.workspace.getConfiguration("alishaVoice");
  const gender = config.get<VoiceGender>("gender", "female");
  const speed = config.get<number>("speed", 1.0);

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `ALISHA: Reading sentence ${targetIndex + 1}...`,
    cancellable: true
  }, async (progress, userProgressToken) => {
    userProgressToken.onCancellationRequested(() => {
      stopCurrentPlayback();
    });

    for (let i = targetIndex; i < activeChunks.length; i++) {
      if (token.isCancellationRequested || !isReadingActive) break;
      const c = activeChunks[i];
      progress.report({
        message: `Sentence ${i + 1}/${activeChunks.length}: "${c.text.substring(0, 30)}..."`
      });

      try {
        const wavPath = await piperEngine.synthesizeChunkToWavFile(c.text, gender, speed);
        if (token.isCancellationRequested || !isReadingActive) {
          try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}
          break;
        }

        const durationMs = getWavDurationMs(wavPath);
        const wordTimings = calculateWordTimings(c.text, durationMs);
        chunkTimingMap.set(c.index, { durationMs, wordTimings });

        audioPlayer.enqueueChunk(wavPath, c.index, speed);
      } catch (err) {
        console.error(`Error synthesizing jumped chunk ${i}:`, err);
      }
    }
  });
}

async function sendActiveDocToWebview() {
  if (isReadingActive && activeChunks.length > 0) {
    alienPetWebview.loadDocument(
      currentDocumentName || "Document",
      activeChunks.map((c) => ({ index: c.index, text: c.text })),
      currentReadingChunkIndex
    );
    alienPetWebview.updateState(audioPlayer.getIsPaused() ? "paused" : "playing");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const uri = editor?.document.uri || getActiveDocumentUri();
  if (uri) {
    try {
      const skipCodeBlocks = vscode.workspace.getConfiguration("alishaVoice").get<boolean>("skipCodeBlocksInMarkdown", true);
      const parsedDoc = await parseDocumentSource(uri, undefined, skipCodeBlocks);
      if (parsedDoc.speechText.trim()) {
        const chunks = chunkTextIntoSentences(parsedDoc.speechText);
        if (chunks.length > 0) {
          activeChunks = chunks;
          currentDocumentName = parsedDoc.fileName;
          currentReadingChunkIndex = 0;
          alienPetWebview.loadDocument(
            parsedDoc.fileName,
            chunks.map((c) => ({ index: c.index, text: c.text })),
            0
          );
          alienPetWebview.updateState("stopped");
        }
      }
    } catch (e) {
      console.warn("Could not pre-load active document into webview:", e);
    }
  }
}

function stopCurrentPlayback() {
  if (cancellationTokenSource) {
    cancellationTokenSource.cancel();
    cancellationTokenSource.dispose();
    cancellationTokenSource = null;
  }
  isReadingActive = false;
  activeChunks = [];
  chunkTimingMap.clear();
  if (audioPlayer) {
    audioPlayer.stop();
  }
  if (alienTracker) {
    alienTracker.setStatus("stopped");
  }
  if (alienPetWebview) {
    alienPetWebview.updateState("stopped");
  }
  if (statusBar) {
    statusBar.setStatus("stopped");
  }
}

export function deactivate() {
  stopClipboardWatcher();
  stopCurrentPlayback();
  if (audioPlayer) {
    audioPlayer.dispose();
  }
  if (alienTracker) {
    alienTracker.dispose();
  }
  if (statusBar) {
    statusBar.dispose();
  }
}
