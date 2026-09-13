import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { AudioPlayerCallbacks } from "./audioPlayerWebview";

export interface QueuedChunk {
  wavPath: string;
  chunkIndex: number;
  speed: number;
}

export class NativeAudioPlayer {
  private context: vscode.ExtensionContext;
  private callbacks: AudioPlayerCallbacks;
  private queue: QueuedChunk[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private currentChunk: QueuedChunk | null = null;
  private playerProcess: ChildProcess | null = null;
  private playbackSpeed: number = 1.0;
  private volume: number = 1.0;
  private isProcessReady: boolean = false;
  private pendingStdin: string[] = [];

  constructor(context: vscode.ExtensionContext, callbacks: AudioPlayerCallbacks) {
    this.context = context;
    this.callbacks = callbacks;
    this.initProcess();
  }

  private getPlayerExePath(): string | null {
    if (os.platform() === "win32") {
      const p = path.join(this.context.extensionPath, "bin", "win32", "alisha-player.exe");
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private initProcess() {
    const exe = this.getPlayerExePath();
    if (!exe) return;

    try {
      this.playerProcess = spawn(exe, [], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });

      this.playerProcess.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString("utf-8").split("\n");
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;

          if (line === "READY") {
            this.isProcessReady = true;
            while (this.pendingStdin.length > 0) {
              const cmd = this.pendingStdin.shift();
              if (cmd && this.playerProcess?.stdin) {
                this.playerProcess.stdin.write(cmd + "\n");
              }
            }
          } else if (line.startsWith("OPENED:") || line === "PLAYING") {
            this.isPlaying = true;
            this.isPaused = false;
            if (this.currentChunk) {
              this.callbacks.onChunkStarted(this.currentChunk.chunkIndex);
            }
            this.callbacks.onStateChange("playing");
          } else if (line === "ENDED") {
            this.handleChunkEnded();
          } else if (line === "PAUSED") {
            this.isPaused = true;
            this.callbacks.onStateChange("paused");
          } else if (line === "RESUMED") {
            this.isPaused = false;
            this.callbacks.onStateChange("playing");
          } else if (line === "STOPPED") {
            this.isPlaying = false;
            this.isPaused = false;
            this.callbacks.onStateChange("stopped");
          }
        }
      });

      this.playerProcess.on("exit", () => {
        this.playerProcess = null;
        this.isProcessReady = false;
      });
    } catch (e) {
      console.error("Failed to start native audio player process:", e);
    }
  }

  private sendCommand(cmd: string) {
    if (this.playerProcess && this.isProcessReady) {
      try {
        this.playerProcess.stdin?.write(cmd + "\n");
      } catch {
        this.pendingStdin.push(cmd);
      }
    } else {
      this.pendingStdin.push(cmd);
      if (!this.playerProcess) {
        this.initProcess();
      }
    }
  }

  public enqueueChunk(wavPath: string, chunkIndex: number, speed: number = 1.0) {
    this.queue.push({ wavPath, chunkIndex, speed });
    this.playbackSpeed = speed;
    if (!this.isPlaying && !this.isPaused) {
      this.playNext();
    }
  }

  private playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.isPaused = false;
      this.currentChunk = null;
      this.callbacks.onPlaybackFinished();
      this.callbacks.onStateChange("stopped");
      return;
    }

    this.currentChunk = this.queue.shift()!;
    this.isPlaying = true;
    this.isPaused = false;

    const exe = this.getPlayerExePath();
    if (exe && this.playerProcess) {
      this.sendCommand(`SPEED ${this.playbackSpeed}`);
      this.sendCommand(`VOLUME ${this.volume}`);
      this.sendCommand(`PLAY "${this.currentChunk.wavPath}"`);
    } else if (os.platform() === "win32") {
      // Fallback to PowerShell SoundPlayer
      const ps = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `(New-Object System.Media.SoundPlayer '${this.currentChunk.wavPath}').PlaySync()`
      ], { windowsHide: true });

      this.callbacks.onChunkStarted(this.currentChunk.chunkIndex);
      this.callbacks.onStateChange("playing");

      ps.on("close", () => {
        this.handleChunkEnded();
      });
    } else if (os.platform() === "darwin") {
      // macOS fallback
      const af = spawn("afplay", [this.currentChunk.wavPath]);
      this.callbacks.onChunkStarted(this.currentChunk.chunkIndex);
      this.callbacks.onStateChange("playing");
      af.on("close", () => {
        this.handleChunkEnded();
      });
    } else {
      // Linux fallback
      const ap = spawn("aplay", [this.currentChunk.wavPath]);
      this.callbacks.onChunkStarted(this.currentChunk.chunkIndex);
      this.callbacks.onStateChange("playing");
      ap.on("close", () => {
        this.handleChunkEnded();
      });
    }
  }

  private handleChunkEnded() {
    if (this.currentChunk) {
      this.callbacks.onChunkEnded(this.currentChunk.chunkIndex);
      // Clean up temp wav file from disk
      try {
        if (fs.existsSync(this.currentChunk.wavPath)) {
          fs.unlinkSync(this.currentChunk.wavPath);
        }
      } catch {}
      this.currentChunk = null;
    }
    this.playNext();
  }

  public pause() {
    if (this.playerProcess && this.isProcessReady) {
      this.sendCommand("PAUSE");
    }
  }

  public resume() {
    if (this.playerProcess && this.isProcessReady) {
      this.sendCommand("RESUME");
    } else if (!this.isPlaying && this.queue.length > 0) {
      this.playNext();
    }
  }

  public stop() {
    this.queue = [];
    if (this.currentChunk) {
      try {
        if (fs.existsSync(this.currentChunk.wavPath)) {
          fs.unlinkSync(this.currentChunk.wavPath);
        }
      } catch {}
      this.currentChunk = null;
    }
    if (this.playerProcess && this.isProcessReady) {
      this.sendCommand("STOP");
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.callbacks.onStateChange("stopped");
  }

  public clearQueue() {
    // Delete any queued temp wav files
    for (const item of this.queue) {
      try {
        if (fs.existsSync(item.wavPath)) {
          fs.unlinkSync(item.wavPath);
        }
      } catch {}
    }
    this.queue = [];
  }

  public setSpeed(speed: number) {
    this.playbackSpeed = speed;
    this.sendCommand(`SPEED ${speed}`);
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setVolume(vol: number) {
    this.volume = vol;
    this.sendCommand(`VOLUME ${vol}`);
  }

  public dispose() {
    this.stop();
    if (this.playerProcess) {
      this.sendCommand("QUIT");
      setTimeout(() => {
        try {
          this.playerProcess?.kill();
        } catch {}
      }, 500);
    }
  }
}
