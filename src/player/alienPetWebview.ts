import * as vscode from "vscode";

export interface AlienPetCallbacks {
  onJumpToChunk?: (chunkIndex: number) => void;
  onRequestDoc?: () => void;
  onStartRead?: () => void;
  onToggleVoice?: () => void;
  onPauseResume?: () => void;
  onStop?: () => void;
  onSetSpeed?: (speed: number) => void;
}

export class AlienPetWebview implements vscode.WebviewViewProvider {
  public static readonly viewType = "alishaVoice.sidebarView";
  private panel: vscode.WebviewPanel | undefined;
  private webviewView: vscode.WebviewView | undefined;
  private extensionUri: vscode.Uri;
  private isVisible: boolean = false;
  private callbacks?: AlienPetCallbacks;

  private currentDocument: { fileName: string; chunks: { index: number; text: string }[] } | null = null;
  private currentChunkIndex: number = -1;
  private currentState: "playing" | "paused" | "stopped" = "stopped";
  private currentVoiceGender: string = "female";
  private currentSpeed: number = 1.0;

  constructor(extensionUri: vscode.Uri, callbacks?: AlienPetCallbacks) {
    this.extensionUri = extensionUri;
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: AlienPetCallbacks) {
    this.callbacks = callbacks;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleWebviewMessage(message);
    });

    webviewView.onDidDispose(() => {
      this.webviewView = undefined;
    });

    setTimeout(() => {
      this.syncCurrentStateToWebview();
      if (this.callbacks?.onRequestDoc) {
        this.callbacks.onRequestDoc();
      }
    }, 200);
  }

  public showOrToggle() {
    if (this.webviewView) {
      this.webviewView.show(true);
      this.syncCurrentStateToWebview();
      return;
    }

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.syncCurrentStateToWebview();
      return;
    }

    vscode.commands.executeCommand("alishaVoice.sidebarView.focus");
  }

  private handleWebviewMessage(message: any) {
    switch (message.command) {
      case "ready":
        this.syncCurrentStateToWebview();
        if (this.callbacks?.onRequestDoc) {
          this.callbacks.onRequestDoc();
        }
        break;
      case "jumpToChunk":
        if (typeof message.chunkIndex === "number" && this.callbacks?.onJumpToChunk) {
          this.callbacks.onJumpToChunk(message.chunkIndex);
        }
        break;
      case "pauseResume":
        vscode.commands.executeCommand("alishaVoice.pauseResume");
        break;
      case "stop":
        vscode.commands.executeCommand("alishaVoice.stop");
        break;
      case "toggleVoice":
        vscode.commands.executeCommand("alishaVoice.toggleVoice");
        break;
      case "setSpeed":
        if (typeof message.speed === "number") {
          this.currentSpeed = message.speed;
          if (this.callbacks?.onSetSpeed) {
            this.callbacks.onSetSpeed(message.speed);
          }
        }
        break;
      case "readDoc":
        if (this.callbacks?.onStartRead) {
          this.callbacks.onStartRead();
        } else {
          vscode.commands.executeCommand("alishaVoice.readFile");
        }
        break;
      case "readSelection":
        vscode.commands.executeCommand("alishaVoice.readSelection");
        break;
      case "requestDoc":
        if (this.callbacks?.onRequestDoc) {
          this.callbacks.onRequestDoc();
        }
        break;
    }
  }

  private postMessage(message: any) {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
    if (this.webviewView) {
      this.webviewView.webview.postMessage(message);
    }
  }

  public loadDocument(fileName: string, chunks: { index: number; text: string }[], activeIndex: number = 0) {
    this.currentDocument = { fileName, chunks };
    this.currentChunkIndex = activeIndex;

    this.postMessage({
      command: "loadDocument",
      fileName,
      chunks,
      activeIndex
    });
  }

  public startChunkSpeech(
    chunkIndex: number,
    text: string,
    wordTimings: { word: string; startMs: number; endMs: number }[],
    totalDurationMs: number,
    totalChunks: number
  ) {
    this.currentChunkIndex = chunkIndex;
    this.postMessage({
      command: "startChunkSpeech",
      chunkIndex,
      text,
      wordTimings,
      totalDurationMs,
      totalChunks
    });
  }

  public updateReadingChunk(text: string, chunkIndex: number, totalChunks: number) {
    this.currentChunkIndex = chunkIndex;
    this.postMessage({
      command: "updateChunk",
      text,
      chunkIndex,
      totalChunks
    });
  }

  public updateState(state: "playing" | "paused" | "stopped") {
    this.currentState = state;
    this.postMessage({
      command: "stateChange",
      state
    });
  }

  public setVoice(gender: string) {
    this.currentVoiceGender = gender;
    this.postMessage({
      command: "voiceChange",
      gender
    });
  }

  public setSpeed(speed: number) {
    this.currentSpeed = speed;
    this.postMessage({
      command: "speedChange",
      speed
    });
  }

  private syncCurrentStateToWebview() {
    this.postMessage({
      command: "stateChange",
      state: this.currentState
    });

    this.postMessage({
      command: "speedChange",
      speed: this.currentSpeed
    });

    if (this.currentDocument) {
      this.postMessage({
        command: "loadDocument",
        fileName: this.currentDocument.fileName,
        chunks: this.currentDocument.chunks,
        activeIndex: this.currentChunkIndex >= 0 ? this.currentChunkIndex : 0
      });
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cosmo Gamified Docs Reader</title>
  <style>
    :root {
      --bg-dark: #070b14;
      --panel-bg: #0d1322;
      --card-bg: #131c31;
      --paper-bg: rgba(13, 20, 36, 0.78);
      --border-color: #1e293b;
      --neon-cyan: #38bdf8;
      --neon-green: #4ade80;
      --neon-yellow: #facc15;
      --neon-purple: #c084fc;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --doc-font-size: 1.22rem;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    /* Custom Sleek Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(7, 11, 20, 0.7);
    }
    ::-webkit-scrollbar-thumb {
      background: #1e293b;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--neon-cyan);
    }

    /* Top Navigation Bar */
    .ide-header {
      background: #090e1a;
      border-bottom: 1px solid var(--border-color);
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
      font-size: 0.8rem;
      z-index: 25;
    }
    .ide-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .window-dots {
      display: flex;
      gap: 6px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #eab308; }
    .dot-green { background: #22c55e; }
    .ide-app-title {
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-left: 8px;
    }
    .ide-tabs {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 100%;
    }
    .tab-item {
      background: var(--panel-bg);
      border-right: 1px solid var(--border-color);
      border-left: 1px solid var(--border-color);
      border-top: 2px solid var(--neon-cyan);
      padding: 0 16px;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-main);
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Main Workspace Layout */
    .workspace-body {
      flex: 1;
      display: flex;
      overflow: hidden;
      position: relative;
    }

    /* Document Reader Canvas Area */
    .reader-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: radial-gradient(circle at 45% 35%, #0d162a 0%, #070b14 100%);
      overflow: hidden;
      position: relative;
    }

    /* 60FPS Flight Overlay Canvas */
    #flightCanvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 20;
    }

    /* Document Viewport (Smooth Scrollable Container) */
    .docs-viewport {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 24px 28px 80px 28px;
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 10;
      scroll-behavior: smooth;
    }

    /* Document Paper (Clean Modern Card - Notion/GitBook Aesthetic) */
    .docs-paper {
      width: 100%;
      max-width: 880px;
      margin: 0 auto;
      background: var(--paper-bg);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(56, 189, 248, 0.16);
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6), 0 0 35px rgba(56, 189, 248, 0.05);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    /* Slim Real-Time Reading Progress Line across top of paper */
    .doc-progress-line {
      height: 3.5px;
      background: rgba(255, 255, 255, 0.06);
      width: 100%;
      position: relative;
      overflow: hidden;
    }
    .doc-progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #38bdf8, #c084fc, #4ade80);
      transition: width 0.3s ease;
      box-shadow: 0 0 10px #38bdf8;
    }

    /* Document Header Card */
    .doc-header {
      padding: 28px 36px 20px 36px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.03) 0%, transparent 100%);
    }

    .doc-meta-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .doc-badges-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .doc-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .badge-type {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
    }
    .badge-count {
      background: rgba(192, 132, 252, 0.12);
      border: 1px solid rgba(192, 132, 252, 0.3);
      color: #c084fc;
    }
    .badge-time {
      background: rgba(250, 204, 21, 0.12);
      border: 1px solid rgba(250, 204, 21, 0.3);
      color: #facc15;
    }

    /* Font Size Controls */
    .font-size-ctrl {
      display: flex;
      align-items: center;
      gap: 3px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 2px 6px;
    }
    .font-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px 7px;
      font-size: 0.78rem;
      font-weight: 800;
      border-radius: 4px;
      transition: all 0.15s ease;
    }
    .font-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }
    .font-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted);
      min-width: 36px;
      text-align: center;
      user-select: none;
    }

    /* Document Title Row */
    .doc-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .doc-title {
      font-size: 1.55rem;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.3px;
      line-height: 1.3;
      display: flex;
      align-items: center;
      gap: 10px;
      word-break: break-word;
    }
    .doc-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .read-doc-btn {
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #070b14;
      font-weight: 800;
      font-size: 0.82rem;
      padding: 7px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
      transition: all 0.2s ease;
    }
    .read-doc-btn:hover {
      transform: scale(1.04);
      background: linear-gradient(135deg, #38bdf8, #7dd3fc);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.55);
    }
    .refresh-doc-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 0.82rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .refresh-doc-btn:hover {
      color: #ffffff;
      border-color: var(--neon-cyan);
    }

    /* Document Content Stream */
    .doc-stream {
      padding: 28px 36px 60px 36px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Sentence Card */
    .doc-sentence {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 10px 14px;
      border-radius: 10px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      border: 1.5px solid transparent;
      position: relative;
    }
    .doc-sentence:hover {
      background: rgba(255, 255, 255, 0.035);
      border-color: rgba(56, 189, 248, 0.2);
    }
    .doc-sentence:hover .sentence-gutter {
      color: var(--neon-cyan);
      opacity: 1;
    }

    /* Active Sentence Focus Frame */
    .doc-sentence.active {
      background: rgba(56, 189, 248, 0.08);
      border-color: rgba(56, 189, 248, 0.45);
      box-shadow: 0 4px 24px rgba(56, 189, 248, 0.14), inset 0 0 16px rgba(56, 189, 248, 0.04);
      border-radius: 12px;
    }
    .doc-sentence.active .sentence-gutter {
      color: var(--neon-cyan);
      font-weight: 800;
      opacity: 1;
      text-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
    }

    /* Completed Read Sentences */
    .doc-sentence.completed {
      opacity: 0.65;
      color: #94a3b8;
    }
    .doc-sentence.completed .sentence-gutter {
      color: #22c55e;
      opacity: 0.8;
    }

    .sentence-gutter {
      font-family: monospace;
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--text-dim);
      opacity: 0.65;
      min-width: 34px;
      text-align: right;
      user-select: none;
      padding-top: 6px;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }

    .sentence-body {
      flex: 1;
      font-size: var(--doc-font-size);
      line-height: 2.3; /* Breathing room for live companion flight above words */
      letter-spacing: 0.2px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      word-break: break-word;
    }

    /* Words Styling inside Active Sentence */
    .word-node {
      position: relative;
      display: inline-block;
      margin: 2px 4px;
      padding: 2px 7px;
      border-radius: 6px;
      transition: all 0.18s ease;
      cursor: pointer;
      vertical-align: middle;
    }
    .word-node:hover {
      background: rgba(56, 189, 248, 0.15);
    }

    /* Read Words: Soft Glow + Waypoint Dots */
    .word-node.read {
      color: #67e8f9;
      text-shadow: 0 0 10px rgba(56, 189, 248, 0.65);
    }
    .word-node.read::after {
      content: "•";
      position: absolute;
      bottom: -11px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.95rem;
      color: rgba(56, 189, 248, 0.7);
      text-shadow: 0 0 6px #38bdf8;
    }

    /* Active Target Word: Radiant Glow Box + Dynamic Reticle */
    .word-node.active-target {
      color: #ffffff;
      font-weight: 700;
      background: rgba(250, 204, 21, 0.22);
      border: 1.5px solid #facc15;
      box-shadow: 0 0 20px rgba(250, 204, 21, 0.5), inset 0 0 10px rgba(56, 189, 248, 0.35);
      transform: scale(1.05);
      z-index: 15;
    }

    /* Dynamic Holographic Reticle HUD Marker */
    .target-reticle {
      position: absolute;
      top: -5px;
      left: -6px;
      right: -6px;
      bottom: -5px;
      pointer-events: none;
      border-radius: 8px;
      border: 1.5px dashed rgba(56, 189, 248, 0.85);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.45);
      animation: pulseReticle 1.6s ease-in-out infinite alternate;
    }
    .target-reticle::before {
      content: "";
      position: absolute;
      top: -3px; left: -3px; right: -3px; bottom: -3px;
      border-radius: 10px;
      border: 1px solid rgba(250, 204, 21, 0.55);
      animation: pulseSubReticle 1.6s ease-in-out infinite alternate;
    }
    @keyframes pulseReticle {
      0% { transform: scale(0.97); opacity: 0.75; }
      100% { transform: scale(1.03); opacity: 1; }
    }
    @keyframes pulseSubReticle {
      0% { opacity: 0.4; }
      100% { opacity: 0.85; }
    }

    /* Unread Words */
    .word-node.unread {
      color: var(--text-main);
    }

    /* Empty / Welcome State */
    .doc-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      gap: 16px;
    }
    .empty-icon {
      font-size: 3.2rem;
      filter: drop-shadow(0 0 18px #4ade80);
      animation: floatEmpty 2.8s ease-in-out infinite alternate;
    }
    @keyframes floatEmpty {
      0% { transform: translateY(-4px); }
      100% { transform: translateY(4px); }
    }
    .empty-title {
      font-size: 1.3rem;
      font-weight: 800;
      color: #ffffff;
    }
    .empty-desc {
      font-size: 0.88rem;
      color: var(--text-muted);
      max-width: 440px;
      line-height: 1.6;
    }
    .empty-btn-group {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }

    /* Right Sidebar: Alien Reading-Progress Dashboard */
    .progress-sidebar {
      width: 280px;
      background: var(--panel-bg);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      padding: 20px 18px;
      gap: 20px;
      flex-shrink: 0;
      box-shadow: -4px 0 18px rgba(0, 0, 0, 0.35);
      z-index: 12;
    }

    .sidebar-title {
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Circular Progress Dial */
    .gauge-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 8px 0;
    }
    .gauge-circle {
      position: relative;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: conic-gradient(#38bdf8 0% 0%, rgba(255, 255, 255, 0.08) 0% 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
    }
    .gauge-inner {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      background: var(--panel-bg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.8);
    }
    .gauge-value {
      font-size: 1.9rem;
      font-weight: 800;
      color: #ffffff;
      text-shadow: 0 0 12px var(--neon-cyan);
    }
    .gauge-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--neon-cyan);
    }

    /* Metrics Cards */
    .metric-card {
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric-top {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }
    .metric-value {
      font-size: 0.92rem;
      font-weight: 700;
      color: #ffffff;
    }

    /* Live Tracking Chips */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.35);
      border-radius: 20px;
      padding: 6px 12px;
      font-size: 0.75rem;
      font-weight: 700;
      color: #4ade80;
    }
    .pulse-radar {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 8px #4ade80;
      animation: radarPing 1.6s infinite;
    }
    @keyframes radarPing {
      0% { transform: scale(0.9); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.5; }
      100% { transform: scale(0.9); opacity: 1; }
    }

    .flying-target-box {
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      color: #ffffff;
    }
    .alien-head-icon {
      font-size: 1.3rem;
      filter: drop-shadow(0 0 6px #4ade80);
    }
    .target-highlight {
      color: var(--neon-yellow);
      background: rgba(250, 204, 21, 0.2);
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid var(--neon-yellow);
    }

    /* Bottom Text-To-Speech Playback Dock */
    .audio-dock {
      background: #090e1a;
      border-top: 1px solid var(--border-color);
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      flex-shrink: 0;
      z-index: 25;
    }

    .dock-left {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 240px;
    }
    .voice-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
    }
    .voice-meta {
      display: flex;
      flex-direction: column;
    }
    .voice-name {
      font-size: 0.82rem;
      font-weight: 700;
      color: #ffffff;
    }
    .voice-desc {
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    /* Center Playback Controls & Waveform */
    .dock-center {
      display: flex;
      align-items: center;
      gap: 20px;
      flex: 1;
      max-width: 600px;
      justify-content: center;
    }
    .transport-buttons {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .play-btn {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--neon-cyan);
      color: #070b14;
      border: none;
      font-size: 1rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
    }
    .play-btn:hover {
      transform: scale(1.08);
      background: #7dd3fc;
    }
    .icon-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.15s ease;
    }
    .icon-btn:hover {
      color: #ffffff;
      border-color: var(--neon-cyan);
    }

    /* Waveform Canvas */
    .waveform-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }
    .time-stamp {
      font-size: 0.72rem;
      font-family: monospace;
      color: var(--text-muted);
    }
    #waveCanvas {
      width: 100%;
      height: 28px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 4px;
    }

    /* Dock Right Controls */
    .dock-right {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 220px;
      justify-content: flex-end;
    }
    .speed-control-box {
      display: inline-flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 2px 4px;
      gap: 2px;
    }
    .speed-step-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 800;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 50%;
      transition: all 0.15s ease;
      user-select: none;
    }
    .speed-step-btn:hover {
      background: rgba(56, 189, 248, 0.2);
      color: var(--neon-cyan);
    }
    .speed-pill {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 2px 8px;
      color: var(--text-main);
      cursor: pointer;
      user-select: none;
      border-radius: 8px;
      transition: all 0.15s ease;
      min-width: 38px;
      text-align: center;
    }
    .speed-pill:hover {
      background: var(--neon-cyan);
      color: #070b14;
    }
    .vol-slider {
      width: 70px;
      accent-color: var(--neon-cyan);
      cursor: pointer;
    }
  </style>
</head>
<body>

  <!-- Top Navigation Bar -->
  <header class="ide-header">
    <div class="ide-title-group">
      <div class="window-dots">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
      </div>
      <span class="ide-app-title">NebulaCode — Live Voice Reader</span>
    </div>

    <div class="ide-tabs">
      <div class="tab-item">
        <span>📄</span>
        <span id="activeDocTab">Loading document...</span>
      </div>
    </div>

    <div style="font-size: 0.75rem; color: var(--text-muted);">
      <span>🚀 Offline Neural Core</span>
    </div>
  </header>

  <!-- Main Body: Reader View + Alien Progress Sidebar -->
  <div class="workspace-body">
    
    <!-- Reader Canvas Area -->
    <main class="reader-area" id="readerArea">
      <!-- 60FPS Flight Physics Overlay Canvas -->
      <canvas id="flightCanvas"></canvas>

      <!-- Document Viewport -->
      <div class="docs-viewport" id="docsViewport">
        <div class="docs-paper" id="docsPaper">
          
          <!-- Real-Time Top Reading Progress Bar -->
          <div class="doc-progress-line">
            <div class="doc-progress-fill" id="docProgressFill"></div>
          </div>

          <!-- Document Header Card -->
          <div class="doc-header">
            <div class="doc-meta-bar">
              <div class="doc-badges-group">
                <span class="doc-badge badge-type" id="docTypeBadge">📄 Document</span>
                <span class="doc-badge badge-count" id="docCountBadge">0 Sentences</span>
                <span class="doc-badge badge-time" id="docTimeBadge">⏱ 0 min read</span>
              </div>

              <!-- Font Size Controls -->
              <div class="font-size-ctrl" title="Scale Reading Font Size">
                <button class="font-btn" onclick="changeFontSize(-0.1)" title="Smaller text">A−</button>
                <span class="font-label" id="fontSizeLabel">100%</span>
                <button class="font-btn" onclick="changeFontSize(0.1)" title="Larger text">A+</button>
              </div>
            </div>

            <div class="doc-title-row">
              <h1 class="doc-title" id="docTitle">Select a document to begin</h1>
              <div class="doc-actions">
                <button class="read-doc-btn" id="btnReadDoc" onclick="startOrResumeDoc()">
                  <span>▶</span> <span id="readBtnText">Read Document</span>
                </button>
                <button class="refresh-doc-btn" onclick="sendCmd('requestDoc')" title="Reload document from active editor">
                  🔄
                </button>
              </div>
            </div>
          </div>

          <!-- Document Sentence Stream -->
          <div class="doc-stream" id="docStream">
            <!-- Rendered dynamically by JavaScript -->
          </div>

        </div>
      </div>
    </main>

    <!-- Right Sidebar: Alien Progress Dashboard -->
    <aside class="progress-sidebar">
      <div class="sidebar-title">
        <span>ALIEN PROGRESS</span>
      </div>

      <!-- Circular Progress Gauge -->
      <div class="gauge-wrapper">
        <div class="gauge-circle" id="gaugeCircle">
          <div class="gauge-inner">
            <span class="gauge-value" id="gaugeText">0%</span>
            <span class="gauge-label">Completed</span>
          </div>
        </div>
      </div>

      <!-- Progression Status Card -->
      <div class="metric-card">
        <div class="metric-top">
          <span>PROGRESSION</span>
          <span style="color: var(--neon-cyan);" id="metricEstimate">--</span>
        </div>
        <div class="metric-value" id="metricPages">Sentence 0 of 0</div>
      </div>

      <!-- Live Word Tracking -->
      <div class="status-badge">
        <span class="pulse-radar"></span>
        <span>Live Word Tracking</span>
      </div>

      <!-- Flying to target box -->
      <div class="flying-target-box">
        <span class="alien-head-icon">👽</span>
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">TARGET COORDINATES</span>
          <span>Flying to: <strong class="target-highlight" id="targetLabel">--</strong></span>
        </div>
      </div>

      <div style="margin-top: auto;">
        <button onclick="sendCmd('readDoc')" style="width: 100%; padding: 10px; border-radius: 8px; background: rgba(56, 189, 248, 0.15); border: 1px solid var(--neon-cyan); color: var(--neon-cyan); font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
          ⚡ Read Current Document
        </button>
      </div>
    </aside>

  </div>

  <!-- Bottom Text-To-Speech Playback Controls -->
  <footer class="audio-dock">
    <div class="dock-left">
      <div class="voice-avatar" id="voiceAvatar">👽</div>
      <div class="voice-meta">
        <span class="voice-name" id="narratorName">Narrator: Leo (Space Voice)</span>
        <span class="voice-desc">Offline High-Fidelity Neural TTS</span>
      </div>
    </div>

    <div class="dock-center">
      <div class="transport-buttons">
        <button class="icon-btn" onclick="prevSentence()" title="Previous sentence">⏮</button>
        <button class="play-btn" id="playBtn" onclick="togglePlay()" title="Play / Pause">▶</button>
        <button class="icon-btn" onclick="nextSentence()" title="Next sentence">⏭</button>
      </div>

      <div class="waveform-wrap">
        <span class="time-stamp" id="currTime">00:00</span>
        <canvas id="waveCanvas" width="280" height="28"></canvas>
        <span class="time-stamp" id="totalTime">00:00</span>
      </div>
    </div>

    <div class="dock-right">
      <div class="speed-control-box" title="Playback Speed Controls (0.5x to 2.0x)">
        <button class="speed-step-btn" onclick="stepSpeed(-1)" title="Slow down speech">−</button>
        <span class="speed-pill" id="speedPill" onclick="toggleSpeed()" title="Click to cycle speed">1.0x</span>
        <button class="speed-step-btn" onclick="stepSpeed(1)" title="Speed up speech">+</button>
      </div>
      <span style="font-size: 0.9rem;">🔊</span>
      <input type="range" class="vol-slider" min="0" max="100" value="85">
    </div>
  </footer>

  <script>
    const vscode = acquireVsCodeApi();

    // DOM Elements
    const flightCanvas = document.getElementById('flightCanvas');
    const fCtx = flightCanvas.getContext('2d');
    const waveCanvas = document.getElementById('waveCanvas');
    const wCtx = waveCanvas.getContext('2d');

    const docsViewport = document.getElementById('docsViewport');
    const docStream = document.getElementById('docStream');
    const docTitle = document.getElementById('docTitle');
    const activeDocTab = document.getElementById('activeDocTab');
    const docTypeBadge = document.getElementById('docTypeBadge');
    const docCountBadge = document.getElementById('docCountBadge');
    const docTimeBadge = document.getElementById('docTimeBadge');
    const docProgressFill = document.getElementById('docProgressFill');
    const targetLabel = document.getElementById('targetLabel');
    const playBtn = document.getElementById('playBtn');
    const readBtnText = document.getElementById('readBtnText');
    const gaugeCircle = document.getElementById('gaugeCircle');
    const gaugeText = document.getElementById('gaugeText');
    const metricPages = document.getElementById('metricPages');
    const metricEstimate = document.getElementById('metricEstimate');
    const fontSizeLabel = document.getElementById('fontSizeLabel');

    // State Variables
    let docChunks = [];
    let docFileName = '';
    let currentChunkIndex = -1;
    let currentWordIndex = 0;
    let words = [];

    let isPlaying = false;
    let speed = 1.0;
    const speeds = [0.5, 0.75, 0.85, 1.0, 1.25, 1.5, 1.75, 2.0];
    let currentFontSizeRem = 1.22;

    // Real-Time Audio Synchronization Clock
    let activeSpeech = null;

    // Alien Physics State (High responsiveness spring)
    let alienPos = { x: 300, y: 150 };
    let alienVel = { x: 0, y: 0 };
    let targetPos = { x: 350, y: 180 };
    let flightTrail = [];
    let sparkles = [];
    let time = 0;

    // Default Fallback Demo Content
    const demoChunks = [
      { index: 0, text: "Mission Log Alpha-7: Deep space reconnaissance telemetry established." },
      { index: 1, text: "The player enters the game and begins a new adventure." },
      { index: 2, text: "Across the galaxy, scientists detected signals that suggest the presence of intelligent life." },
      { index: 3, text: "Cosmo companion units have been synchronized across all active orbital observation sectors." },
      { index: 4, text: "All navigation systems confirm optimal acoustic trajectory for real-time document speech." }
    ];

    function resizeCanvas() {
      const rect = flightCanvas.parentElement.getBoundingClientRect();
      flightCanvas.width = rect.width;
      flightCanvas.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function sendCmd(cmd, extra = {}) {
      vscode.postMessage({ command: cmd, ...extra });
    }

    function togglePlay() {
      sendCmd('pauseResume');
    }

    function startOrResumeDoc() {
      if (currentChunkIndex >= 0 && docChunks.length > 0) {
        sendCmd('pauseResume');
      } else {
        sendCmd('readDoc');
      }
    }

    function prevSentence() {
      if (currentChunkIndex > 0) {
        jumpToSentence(currentChunkIndex - 1);
      }
    }

    function nextSentence() {
      if (currentChunkIndex < docChunks.length - 1) {
        jumpToSentence(currentChunkIndex + 1);
      }
    }

    function jumpToSentence(idx) {
      if (idx < 0 || idx >= docChunks.length) return;
      sendCmd('jumpToChunk', { chunkIndex: idx });
    }

    function stepSpeed(delta) {
      let idx = speeds.indexOf(speed);
      if (idx === -1) {
        idx = speeds.findIndex(s => s >= speed);
        if (idx === -1) idx = 3;
      }
      const nextIdx = Math.max(0, Math.min(speeds.length - 1, idx + delta));
      setSpeed(speeds[nextIdx]);
    }

    function toggleSpeed() {
      let idx = speeds.indexOf(speed);
      const nextIdx = (idx + 1) % speeds.length;
      setSpeed(speeds[nextIdx]);
    }

    function setSpeed(val) {
      speed = val;
      const displayVal = (speed % 1 === 0) ? speed.toFixed(0) : speed.toString();
      document.getElementById('speedPill').innerText = displayVal + 'x';
      sendCmd('setSpeed', { speed: val });
    }

    function changeFontSize(delta) {
      currentFontSizeRem = Math.max(0.9, Math.min(2.0, currentFontSizeRem + delta));
      document.documentElement.style.setProperty('--doc-font-size', currentFontSizeRem.toFixed(2) + 'rem');
      fontSizeLabel.innerText = Math.round((currentFontSizeRem / 1.22) * 100) + '%';
      setTimeout(resizeCanvas, 50);
    }

    function focusWord(idx) {
      if (idx < 0 || idx >= words.length) return;
      currentWordIndex = idx;
      updateWordsUI();
      const targetWordClean = words[idx].text.replace(/["\.,]/g, '');
      targetLabel.innerText = targetWordClean;
    }

    function updateWordsUI() {
      for (let i = 0; i < words.length; i++) {
        const el = document.getElementById('word-' + i);
        if (!el) continue;

        if (i === currentWordIndex) {
          el.className = 'word-node active-target';
          el.innerHTML = escapeHtml(words[i].text) + '<div class="target-reticle"></div>';
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else if (i < currentWordIndex) {
          el.className = 'word-node read';
          el.innerText = words[i].text;
        } else {
          el.className = 'word-node unread';
          el.innerText = words[i].text;
        }
      }
    }

    function escapeHtml(str) {
      return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Render Full Document Stream
    function renderDocumentStream(chunks, activeIndex = 0) {
      docChunks = chunks || [];
      currentChunkIndex = activeIndex;

      // Update Header Metadata
      const name = docFileName || 'Document';
      docTitle.innerText = name;
      activeDocTab.innerText = name;

      const lowerName = name.toLowerCase();
      let typeLabel = '📄 Text Document';
      if (lowerName.endsWith('.pdf')) typeLabel = '📕 PDF Document';
      else if (lowerName.endsWith('.md')) typeLabel = '📝 Markdown';
      else if (lowerName.endsWith('.txt')) typeLabel = '📄 Plain Text';
      docTypeBadge.innerText = typeLabel;

      docCountBadge.innerText = docChunks.length + ' Sentences';
      const estWords = docChunks.reduce((acc, c) => acc + c.text.split(/\\s+/).length, 0);
      const estMins = Math.max(1, Math.ceil(estWords / 160));
      docTimeBadge.innerText = '⏱ ~' + estMins + ' min read';

      // Update Top Progress Bar & Sidebar
      const pct = docChunks.length > 0 ? Math.round(((activeIndex + 1) / docChunks.length) * 100) : 0;
      docProgressFill.style.width = pct + '%';
      gaugeCircle.style.background = 'conic-gradient(#38bdf8 0% ' + pct + '%, rgba(255, 255, 255, 0.08) ' + pct + '% 100%)';
      gaugeText.innerText = pct + '%';
      metricPages.innerText = docChunks.length > 0 ? ('Sentence ' + (activeIndex + 1) + ' of ' + docChunks.length) : 'Sentence 0 of 0';
      metricEstimate.innerText = estMins + 'm total';

      // Handle Empty State
      if (docChunks.length === 0) {
        docStream.innerHTML = \`
          <div class="doc-empty-state">
            <span class="empty-icon">👽</span>
            <h2 class="empty-title">Ready to read your document!</h2>
            <p class="empty-desc">
              Open any PDF, Markdown, or text file in VS Code. Cosmo will extract and render the entire text here with live speech tracking.
            </p>
            <div class="empty-btn-group">
              <button class="read-doc-btn" onclick="renderDocumentStream(demoChunks, 1)">
                🚀 Explore Demo Mission Log
              </button>
              <button class="refresh-doc-btn" onclick="sendCmd('requestDoc')">
                🔄 Load Active Tab
              </button>
            </div>
          </div>
        \`;
        return;
      }

      // Build Document Sentences Stream
      let html = '';
      for (let i = 0; i < docChunks.length; i++) {
        const c = docChunks[i];
        const isActive = (i === activeIndex);
        const isCompleted = (i < activeIndex);

        let statusClass = 'pending';
        let gutterText = '#' + (i + 1);

        if (isActive) {
          statusClass = 'active';
        } else if (isCompleted) {
          statusClass = 'completed';
          gutterText = '✓';
        }

        html += '<div class="doc-sentence ' + statusClass + '" id="sentence-' + i + '" onclick="jumpToSentence(' + i + ')">';
        html += '<span class="sentence-gutter">' + gutterText + '</span>';
        html += '<div class="sentence-body" id="sentence-text-' + i + '">';

        if (isActive && words.length > 0) {
          // Render interactive words if currently active
          words.forEach((w, wIdx) => {
            const isTarget = (wIdx === currentWordIndex);
            const isRead = (wIdx < currentWordIndex);
            let wClass = isTarget ? 'active-target' : (isRead ? 'read' : 'unread');
            html += '<span class="word-node ' + wClass + '" id="word-' + wIdx + '" onclick="event.stopPropagation(); focusWord(' + wIdx + ')">';
            html += escapeHtml(w.text);
            if (isTarget) html += '<div class="target-reticle"></div>';
            html += '</span> ';
          });
        } else {
          html += escapeHtml(c.text);
        }

        html += '</div>';
        html += '</div>';
      }

      docStream.innerHTML = html;

      // Auto-scroll active sentence into view smoothly
      setTimeout(() => {
        const activeEl = document.getElementById('sentence-' + activeIndex);
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    }

    // Backend message listener
    window.addEventListener('message', event => {
      const msg = event.data;

      if (msg.command === 'loadDocument') {
        docFileName = msg.fileName || '';
        renderDocumentStream(msg.chunks || [], msg.activeIndex || 0);

      } else if (msg.command === 'startChunkSpeech') {
        // Transition previous sentence to completed
        if (currentChunkIndex >= 0 && currentChunkIndex !== msg.chunkIndex) {
          const prevEl = document.getElementById('sentence-' + currentChunkIndex);
          if (prevEl) {
            prevEl.className = 'doc-sentence completed';
            const gutter = prevEl.querySelector('.sentence-gutter');
            if (gutter) gutter.innerText = '✓';
            const body = document.getElementById('sentence-text-' + currentChunkIndex);
            if (body && docChunks[currentChunkIndex]) {
              body.innerText = docChunks[currentChunkIndex].text;
            }
          }
        }

        currentChunkIndex = msg.chunkIndex;
        const timingWords = msg.wordTimings || [];

        if (timingWords.length > 0) {
          words = timingWords.map((t) => ({
            text: t.word,
            read: false,
            startMs: t.startMs,
            endMs: t.endMs
          }));

          currentWordIndex = 0;

          // Highlight current active sentence card
          const activeSentEl = document.getElementById('sentence-' + msg.chunkIndex);
          if (activeSentEl) {
            activeSentEl.className = 'doc-sentence active';
            const gutter = activeSentEl.querySelector('.sentence-gutter');
            if (gutter) gutter.innerText = '#' + (msg.chunkIndex + 1);

            const body = document.getElementById('sentence-text-' + msg.chunkIndex);
            if (body) {
              let html = '';
              words.forEach((w, idx) => {
                const isTarget = (idx === 0);
                html += '<span class="word-node ' + (isTarget ? 'active-target' : 'unread') + '" id="word-' + idx + '" onclick="event.stopPropagation(); focusWord(' + idx + ')">';
                html += escapeHtml(w.text);
                if (isTarget) html += '<div class="target-reticle"></div>';
                html += '</span> ';
              });
              body.innerHTML = html;
            }

            // Smoothly auto-scroll sentence into center reading line
            activeSentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          activeSpeech = {
            startTime: performance.now(),
            pausedOffset: 0,
            isPaused: false,
            timings: timingWords,
            durationMs: msg.totalDurationMs,
            chunkIndex: msg.chunkIndex,
            totalChunks: msg.totalChunks
          };

          // Update Progress Metrics
          const globalPct = Math.round(((msg.chunkIndex + 1) / (msg.totalChunks || 1)) * 100);
          docProgressFill.style.width = globalPct + '%';
          gaugeText.innerText = globalPct + '%';
          gaugeCircle.style.background = 'conic-gradient(#38bdf8 0% ' + globalPct + '%, rgba(255, 255, 255, 0.08) ' + globalPct + '% 100%)';
          metricPages.innerText = 'Sentence ' + (msg.chunkIndex + 1) + ' of ' + (msg.totalChunks || 1);
          targetLabel.innerText = words[0]?.text.replace(/["\.,]/g, '') || 'word';

          // Snap alien velocity towards the new sentence
          alienVel.x = (targetPos.x - alienPos.x) * 0.4;
          alienVel.y = (targetPos.y - alienPos.y) * 0.4;
        }

      } else if (msg.command === 'speedChange') {
        if (typeof msg.speed === 'number') {
          speed = msg.speed;
          const displayVal = (speed % 1 === 0) ? speed.toFixed(0) : speed.toString();
          document.getElementById('speedPill').innerText = displayVal + 'x';
        }

      } else if (msg.command === 'stateChange') {
        isPlaying = (msg.state === 'playing');
        playBtn.innerText = isPlaying ? '⏸' : '▶';
        readBtnText.innerText = isPlaying ? 'Pause' : 'Read Document';

        if (activeSpeech) {
          if (msg.state === 'paused') {
            activeSpeech.isPaused = true;
            activeSpeech.pausedOffset = performance.now() - activeSpeech.startTime;
          } else if (msg.state === 'playing') {
            activeSpeech.isPaused = false;
            activeSpeech.startTime = performance.now() - activeSpeech.pausedOffset;
          } else if (msg.state === 'stopped') {
            activeSpeech = null;
          }
        }
      }
    });

    // 60FPS Flight Physics, Curved Stardust Trail, and Alien Rendering Loop
    function renderFlightLoop() {
      fCtx.clearRect(0, 0, flightCanvas.width, flightCanvas.height);
      time += 0.05;

      // Real-Time Audio Timing Synchronizer
      if (activeSpeech && !activeSpeech.isPaused) {
        const elapsed = performance.now() - activeSpeech.startTime;
        let targetIdx = 0;
        for (let i = 0; i < activeSpeech.timings.length; i++) {
          if (elapsed >= activeSpeech.timings[i].startMs) {
            targetIdx = i;
          }
        }
        if (targetIdx !== currentWordIndex && targetIdx < words.length) {
          focusWord(targetIdx);
        }
      }

      // Locate active word position on screen relative to canvas
      const activeEl = document.getElementById('word-' + currentWordIndex);
      if (activeEl) {
        const box = activeEl.getBoundingClientRect();
        const readerBox = flightCanvas.getBoundingClientRect();
        targetPos.x = (box.left - readerBox.left) + box.width / 2;
        targetPos.y = (box.top - readerBox.top) - 34; // Sits in the clear vertical airspace above the active word
      }

      // High-Responsiveness Spring Physics
      const dx = targetPos.x - alienPos.x;
      const dy = targetPos.y - alienPos.y;
      alienVel.x += dx * 0.18;
      alienVel.y += dy * 0.18;
      alienVel.x *= 0.70;
      alienVel.y *= 0.70;

      alienPos.x += alienVel.x;
      alienPos.y += alienVel.y;

      // Add flight trail points
      if (Math.abs(alienVel.x) > 0.4 || Math.abs(alienVel.y) > 0.4 || isPlaying) {
        flightTrail.unshift({
          x: alienPos.x,
          y: alienPos.y + 8,
          alpha: 1.0,
          size: 6 + Math.sin(time * 6) * 2
        });

        // Add stardust sparkles
        if (Math.random() > 0.35) {
          sparkles.push({
            x: alienPos.x + (Math.random() * 20 - 10),
            y: alienPos.y + 12 + (Math.random() * 8),
            vx: (Math.random() - 0.5) * 1.8,
            vy: Math.random() * 1.8,
            alpha: 1.0,
            color: ['#facc15', '#38bdf8', '#4ade80', '#c084fc'][Math.floor(Math.random() * 4)]
          });
        }
      }

      // Draw Curved Stardust Flight Trail
      if (flightTrail.length > 2) {
        fCtx.save();
        for (let i = flightTrail.length - 1; i > 0; i--) {
          const pt = flightTrail[i];
          const nextPt = flightTrail[i - 1];
          fCtx.beginPath();
          fCtx.moveTo(pt.x, pt.y);
          fCtx.lineTo(nextPt.x, nextPt.y);
          fCtx.strokeStyle = 'rgba(56, 189, 248, ' + (pt.alpha * 0.75) + ')';
          fCtx.lineWidth = pt.size * (pt.alpha);
          fCtx.lineCap = 'round';
          fCtx.shadowColor = '#38bdf8';
          fCtx.shadowBlur = 8;
          fCtx.stroke();

          pt.alpha -= 0.04;
          if (pt.alpha <= 0) flightTrail.splice(i, 1);
        }
        fCtx.restore();
      }

      // Draw Stardust Sparkles
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.x += s.vx;
        s.y += s.vy;
        s.alpha -= 0.035;

        fCtx.save();
        fCtx.fillStyle = s.color;
        fCtx.shadowColor = s.color;
        fCtx.shadowBlur = 6;
        fCtx.globalAlpha = Math.max(0, s.alpha);
        fCtx.beginPath();
        fCtx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        fCtx.fill();
        fCtx.restore();

        if (s.alpha <= 0) sparkles.splice(i, 1);
      }

      // Draw Holographic Scanning Beam down to the target word
      if (activeEl) {
        const wordBox = activeEl.getBoundingClientRect();
        const rBox = flightCanvas.getBoundingClientRect();
        const wx = (wordBox.left - rBox.left) + wordBox.width / 2;
        const wy = (wordBox.top - rBox.top) + wordBox.height / 2;

        fCtx.save();
        const beamGrad = fCtx.createLinearGradient(alienPos.x, alienPos.y + 10, wx, wy);
        beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
        beamGrad.addColorStop(0.5, 'rgba(250, 204, 21, 0.18)');
        beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');

        fCtx.fillStyle = beamGrad;
        fCtx.beginPath();
        fCtx.moveTo(alienPos.x - 6, alienPos.y + 10);
        fCtx.lineTo(alienPos.x + 6, alienPos.y + 10);
        fCtx.lineTo(wx + (wordBox.width / 2 + 4), wy);
        fCtx.lineTo(wx - (wordBox.width / 2 + 4), wy);
        fCtx.closePath();
        fCtx.fill();
        fCtx.restore();
      }

      // Draw Cute Neon-Green Alien Character (Cosmo)
      const bobY = Math.sin(time * 4.5) * 3.0;
      const tilt = Math.sin(time * 2.5) * 0.08 + (alienVel.x * 0.03);

      fCtx.save();
      fCtx.translate(alienPos.x, alienPos.y + bobY);
      fCtx.rotate(tilt);

      // Alien Outer Aura Glow
      fCtx.shadowColor = '#4ade80';
      fCtx.shadowBlur = 14;

      // Alien Antennae
      fCtx.beginPath();
      fCtx.moveTo(-4, -14);
      fCtx.quadraticCurveTo(-9, -23, -13, -22);
      fCtx.moveTo(4, -14);
      fCtx.quadraticCurveTo(9, -23, 13, -22);
      fCtx.strokeStyle = '#22c55e';
      fCtx.lineWidth = 2.5;
      fCtx.stroke();

      // Antenna Star Orbs
      fCtx.fillStyle = '#fde047';
      fCtx.shadowColor = '#facc15';
      fCtx.shadowBlur = 10;
      fCtx.beginPath();
      fCtx.arc(-13, -22, 3, 0, Math.PI * 2);
      fCtx.arc(13, -22, 3, 0, Math.PI * 2);
      fCtx.fill();

      // Body / Head
      fCtx.beginPath();
      fCtx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
      fCtx.fillStyle = '#4ade80';
      fCtx.fill();

      // Cheeks
      fCtx.beginPath();
      fCtx.ellipse(-11, 3, 3.2, 2, 0, 0, Math.PI * 2);
      fCtx.ellipse(11, 3, 3.2, 2, 0, 0, Math.PI * 2);
      fCtx.fillStyle = 'rgba(251, 113, 133, 0.7)';
      fCtx.fill();

      // Excited Kawaii Eyes
      fCtx.fillStyle = '#0f172a';
      fCtx.beginPath();
      fCtx.ellipse(-6, -1.5, 4.2, 5.8, 0, 0, Math.PI * 2);
      fCtx.ellipse(6, -1.5, 4.2, 5.8, 0, 0, Math.PI * 2);
      fCtx.fill();

      // Big Sparkly Eye Highlights
      fCtx.fillStyle = '#ffffff';
      fCtx.beginPath();
      fCtx.arc(-7, -3, 1.8, 0, Math.PI * 2);
      fCtx.arc(5, -3, 1.8, 0, Math.PI * 2);
      fCtx.arc(-4.5, 1.5, 0.9, 0, Math.PI * 2);
      fCtx.arc(7.5, 1.5, 0.9, 0, Math.PI * 2);
      fCtx.fill();

      // Excited Open Smile
      fCtx.beginPath();
      fCtx.arc(0, 4, 3.2, 0, Math.PI);
      fCtx.fillStyle = '#065f46';
      fCtx.fill();

      fCtx.restore();

      requestAnimationFrame(renderFlightLoop);
    }

    // Live Animated Audio Waveform in Bottom Dock
    function renderWaveform() {
      wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
      const bars = 36;
      const barWidth = waveCanvas.width / bars;

      for (let i = 0; i < bars; i++) {
        const height = isPlaying
          ? (Math.sin(time * 8 + i * 0.6) * 0.5 + 0.5) * 18 + 4
          : 3;
        const x = i * barWidth;
        const y = (waveCanvas.height - height) / 2;

        const grad = wCtx.createLinearGradient(0, y, 0, y + height);
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(1, '#c084fc');

        wCtx.fillStyle = grad;
        wCtx.fillRect(x + 1, y, barWidth - 2, height);
      }

      requestAnimationFrame(renderWaveform);
    }

    // Start 60FPS Loops
    renderFlightLoop();
    renderWaveform();

    // On Load: Notify extension and request document immediately
    sendCmd('ready');
    sendCmd('requestDoc');
  </script>
</body>
</html>`;
  }
}
