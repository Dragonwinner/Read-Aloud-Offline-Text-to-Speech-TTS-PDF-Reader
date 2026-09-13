import * as vscode from "vscode";
import { WebviewToHostMessage, HostToWebviewMessage } from "../types";

export interface AudioPlayerCallbacks {
  onChunkStarted: (chunkIndex: number) => void;
  onChunkEnded: (chunkIndex: number) => void;
  onPlaybackFinished: () => void;
  onStateChange: (state: "playing" | "paused" | "stopped") => void;
}

export class AudioPlayerWebview {
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;
  private callbacks: AudioPlayerCallbacks;
  private isReady: boolean = false;
  private pendingMessages: HostToWebviewMessage[] = [];

  constructor(extensionUri: vscode.Uri, callbacks: AudioPlayerCallbacks) {
    this.extensionUri = extensionUri;
    this.callbacks = callbacks;
  }

  public ensurePanel(): vscode.WebviewPanel {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "alishaAudioPlayer",
        "🔊 ALISHA - Audio Player",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.webview.html = this.getHtml();

      this.panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
        switch (message.command) {
          case "chunkStarted":
            if (message.chunkIndex !== undefined) {
              this.callbacks.onChunkStarted(message.chunkIndex);
            }
            this.callbacks.onStateChange("playing");
            break;
          case "chunkEnded":
            if (message.chunkIndex !== undefined) {
              this.callbacks.onChunkEnded(message.chunkIndex);
            }
            break;
          case "playbackFinished":
            this.callbacks.onPlaybackFinished();
            this.callbacks.onStateChange("stopped");
            break;
          case "playbackPaused":
            this.callbacks.onStateChange("paused");
            break;
          case "playbackResumed":
            this.callbacks.onStateChange("playing");
            break;
          case "playbackStopped":
            this.callbacks.onStateChange("stopped");
            break;
          case "error":
            vscode.window.showErrorMessage(`Audio Player: ${message.message || "Unknown error"}`);
            break;
          case "ready":
            this.isReady = true;
            while (this.pendingMessages.length > 0) {
              const pending = this.pendingMessages.shift();
              if (pending && this.panel) {
                this.panel.webview.postMessage(pending);
              }
            }
            break;
        }
      });

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.isReady = false;
        this.pendingMessages = [];
        this.callbacks.onStateChange("stopped");
      });
    }

    return this.panel;
  }

  public enqueueChunk(audioBase64: string, chunkIndex: number, speed: number = 1.0) {
    this.ensurePanel();
    this.postMessage({
      command: "playChunk",
      audioSrc: audioBase64,
      chunkIndex,
      speed
    });
  }

  public pause() {
    this.postMessage({ command: "pause" });
  }

  public resume() {
    this.postMessage({ command: "resume" });
  }

  public stop() {
    this.pendingMessages = [];
    this.postMessage({ command: "stop" });
  }

  public clearQueue() {
    this.pendingMessages = [];
    this.postMessage({ command: "clearQueue" });
  }

  public setSpeed(speed: number) {
    this.postMessage({ command: "setSpeed", speed });
  }

  private postMessage(msg: HostToWebviewMessage) {
    if (this.panel) {
      if (this.isReady) {
        this.panel.webview.postMessage(msg);
      } else {
        this.pendingMessages.push(msg);
      }
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ALISHA Audio Player</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --border: var(--vscode-widget-border, #454545);
      --accent: var(--vscode-progressBar-background, #007acc);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      margin: 0;
      padding: 16px;
      user-select: none;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .header h2 {
      margin: 0;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-badge {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      background: rgba(0, 122, 204, 0.2);
      color: var(--accent);
      font-weight: bold;
    }
    .controls {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      flex: 1;
      padding: 8px 12px;
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      border-radius: 4px;
      font-size: 0.85rem;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.15s;
    }
    button:hover {
      background: var(--btn-hover);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    .sliders {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 0.85rem;
    }
    .slider-group {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .slider-group label {
      min-width: 60px;
    }
    .slider-group input[type="range"] {
      flex: 1;
      accent-color: var(--accent);
    }
    .queue-info {
      margin-top: 14px;
      font-size: 0.8rem;
      color: var(--vscode-descriptionForeground, #8c8c8c);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>🔊 ALISHA Reader</h2>
      <span id="statusBadge" class="status-badge">Idle</span>
    </div>

    <div class="controls">
      <button id="btnPause" class="secondary" onclick="togglePause()">Pause</button>
      <button id="btnStop" class="secondary" onclick="stopAll()">Stop</button>
    </div>

    <div class="sliders">
      <div class="slider-group">
        <label for="speedSlider">Speed: <span id="speedVal">1.0x</span></label>
        <input id="speedSlider" type="range" min="0.5" max="2.0" step="0.1" value="1.0" oninput="updateSpeed(this.value)">
      </div>
      <div class="slider-group">
        <label for="volumeSlider">Vol: <span id="volVal">100%</span></label>
        <input id="volumeSlider" type="range" min="0" max="1" step="0.05" value="1.0" oninput="updateVolume(this.value)">
      </div>
    </div>

    <div id="queueInfo" class="queue-info">Waiting for document...</div>
  </div>

  <audio id="audioElement" preload="auto"></audio>

  <script>
    const vscode = acquireVsCodeApi();
    const audio = document.getElementById('audioElement');
    const statusBadge = document.getElementById('statusBadge');
    const queueInfo = document.getElementById('queueInfo');
    const btnPause = document.getElementById('btnPause');

    let queue = [];
    let isPlaying = false;
    let currentChunk = null;
    let playbackSpeed = 1.0;

    audio.onended = () => {
      if (currentChunk !== null) {
        vscode.postMessage({ command: 'chunkEnded', chunkIndex: currentChunk.chunkIndex });
      }
      playNext();
    };

    audio.onerror = (e) => {
      vscode.postMessage({ command: 'error', message: 'HTML5 Audio decode failed.' });
      playNext();
    };

    function playNext() {
      if (queue.length === 0) {
        isPlaying = false;
        currentChunk = null;
        statusBadge.innerText = 'Completed';
        queueInfo.innerText = 'Finished reading.';
        vscode.postMessage({ command: 'playbackFinished' });
        return;
      }

      currentChunk = queue.shift();
      isPlaying = true;
      statusBadge.innerText = 'Reading...';
      btnPause.innerText = 'Pause';
      queueInfo.innerText = 'Reading sentence ' + (currentChunk.chunkIndex + 1) + ' (' + queue.length + ' queued)';

      audio.src = currentChunk.audioSrc;
      audio.playbackRate = playbackSpeed;
      audio.play().then(() => {
        vscode.postMessage({ command: 'chunkStarted', chunkIndex: currentChunk.chunkIndex });
      }).catch(err => {
        vscode.postMessage({ command: 'error', message: err.message });
      });
    }

    function togglePause() {
      if (audio.paused && isPlaying) {
        audio.play();
        statusBadge.innerText = 'Reading...';
        btnPause.innerText = 'Pause';
        vscode.postMessage({ command: 'playbackResumed' });
      } else if (!audio.paused) {
        audio.pause();
        statusBadge.innerText = 'Paused';
        btnPause.innerText = 'Resume';
        vscode.postMessage({ command: 'playbackPaused' });
      }
    }

    function stopAll() {
      queue = [];
      audio.pause();
      audio.currentTime = 0;
      isPlaying = false;
      currentChunk = null;
      statusBadge.innerText = 'Stopped';
      btnPause.innerText = 'Pause';
      queueInfo.innerText = 'Playback stopped.';
      vscode.postMessage({ command: 'playbackStopped' });
    }

    function updateSpeed(val) {
      playbackSpeed = parseFloat(val);
      document.getElementById('speedVal').innerText = playbackSpeed.toFixed(1) + 'x';
      audio.playbackRate = playbackSpeed;
    }

    function updateVolume(val) {
      audio.volume = parseFloat(val);
      document.getElementById('volVal').innerText = Math.round(val * 100) + '%';
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'playChunk') {
        queue.push({
          audioSrc: msg.audioSrc,
          chunkIndex: msg.chunkIndex
        });
        if (msg.speed) {
          playbackSpeed = msg.speed;
          document.getElementById('speedSlider').value = playbackSpeed;
          document.getElementById('speedVal').innerText = playbackSpeed.toFixed(1) + 'x';
        }
        if (!isPlaying) {
          playNext();
        } else {
          queueInfo.innerText = 'Reading sentence ' + (currentChunk ? currentChunk.chunkIndex + 1 : 1) + ' (' + queue.length + ' queued)';
        }
      } else if (msg.command === 'pause') {
        if (!audio.paused) togglePause();
      } else if (msg.command === 'resume') {
        if (audio.paused && isPlaying) togglePause();
      } else if (msg.command === 'stop') {
        stopAll();
      } else if (msg.command === 'clearQueue') {
        queue = [];
      } else if (msg.command === 'setSpeed') {
        updateSpeed(msg.speed);
      }
    });

    // Notify host that player webview is initialized and listening
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
