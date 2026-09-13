import * as vscode from "vscode";

export type VoiceGender = "male" | "female";

export type PlaybackStatus = "idle" | "buffering" | "playing" | "paused" | "stopped";

export interface AlishaConfig {
  gender: VoiceGender;
  speed: number;
  highlightActiveText: boolean;
  skipCodeBlocksInMarkdown: boolean;
  customPiperPath: string;
}

export interface TextChunk {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  startLine?: number;
  endLine?: number;
}

export interface AudioQueueItem {
  chunk: TextChunk;
  audioBase64: string;
  durationEstimate?: number;
}

export interface WebviewToHostMessage {
  command: "chunkStarted" | "chunkEnded" | "playbackFinished" | "playbackPaused" | "playbackResumed" | "playbackStopped" | "ready" | "error";
  chunkIndex?: number;
  message?: string;
}

export interface HostToWebviewMessage {
  command: "playChunk" | "clearQueue" | "pause" | "resume" | "stop" | "setSpeed" | "setVolume";
  audioSrc?: string;
  chunkIndex?: number;
  speed?: number;
  volume?: number;
}
