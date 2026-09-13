import * as vscode from "vscode";
import { VoiceGender, PlaybackStatus } from "../types";

export class AlishaStatusBar {
  private item: vscode.StatusBarItem;
  private currentStatus: PlaybackStatus = "idle";
  private currentGender: VoiceGender = "female";

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "alishaVoice.showMenu";
    this.update();
  }

  public setStatus(status: PlaybackStatus) {
    this.currentStatus = status;
    this.update();
  }

  public setGender(gender: VoiceGender) {
    this.currentGender = gender;
    this.update();
  }

  private update() {
    const genderIcon = this.currentGender === "female" ? "♀" : "♂";
    const voiceLabel = this.currentGender === "female" ? "Amy" : "Ryan";

    switch (this.currentStatus) {
      case "playing":
        this.item.text = `$(sound) ALISHA: Reading (${voiceLabel} ${genderIcon})`;
        this.item.tooltip = "ALISHA is reading. Click to Pause.";
        this.item.command = "alishaVoice.pauseResume";
        this.item.show();
        break;
      case "buffering":
        this.item.text = `$(sync~spin) ALISHA: Synthesizing...`;
        this.item.tooltip = "Generating offline neural audio. Click to cancel.";
        this.item.command = "alishaVoice.stop";
        this.item.show();
        break;
      case "paused":
        this.item.text = `$(debug-pause) ALISHA: Paused (${voiceLabel})`;
        this.item.tooltip = "ALISHA is paused. Click to Resume.";
        this.item.command = "alishaVoice.pauseResume";
        this.item.show();
        break;
      case "stopped":
      case "idle":
      default:
        this.item.text = `$(book) ALISHA (${voiceLabel} ${genderIcon})`;
        this.item.tooltip = "ALISHA Docs Reader. Click for Quick Menu (Alt+R: Read Selection/PDF, Alt+C: Auto-Read on Copy).";
        this.item.command = "alishaVoice.showMenu";
        this.item.show();
        break;
    }
  }

  public dispose() {
    this.item.dispose();
  }
}
