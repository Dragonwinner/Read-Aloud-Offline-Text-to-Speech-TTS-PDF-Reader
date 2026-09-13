import * as vscode from "vscode";
import { TextChunk } from "../types";

export class AlienPetTracker {
  private highlightDecoration: vscode.TextEditorDecorationType;
  private petDecoration: vscode.TextEditorDecorationType | null = null;
  private currentEditor: vscode.TextEditor | undefined;
  private baseOffset: number = 0;
  private animTimer: NodeJS.Timeout | null = null;
  private frameIndex: number = 0;
  private currentChunk: TextChunk | null = null;
  private totalChunks: number = 0;

  // Adorable flying alien animations using pure Unicode & styling (Zero SVG)
  private ufoFrames = ["🛸✨", "🛸💫", "🛸🌟", "🛸🪐"];
  private alienEmoticons = ["(｡◕‿◕｡)", "(｡^‿^｡)", "(｡◕‿・｡)", "(｡◕o◕｡)"];

  constructor() {
    this.highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(56, 189, 248, 0.15)",
      border: "1px dashed rgba(56, 189, 248, 0.6)",
      borderRadius: "4px"
    });
  }

  public setEditor(editor: vscode.TextEditor | undefined) {
    this.currentEditor = editor;
  }

  public setBaseOffset(offset: number) {
    this.baseOffset = Math.max(0, offset);
  }

  public setTotalChunks(total: number) {
    this.totalChunks = total;
  }

  public trackChunk(chunk: TextChunk) {
    this.currentChunk = chunk;
    this.renderCurrentPosition("reading");
    this.startFlutterAnimation();
  }

  public setStatus(status: "reading" | "paused" | "stopped" | "finished") {
    if (status === "paused") {
      this.stopAnimation();
      this.renderCurrentPosition("paused");
    } else if (status === "stopped" || status === "finished") {
      this.stopAnimation();
      if (status === "finished") {
        this.renderCurrentPosition("finished");
        setTimeout(() => this.clear(), 3500);
      } else {
        this.clear();
      }
    }
  }

  private startFlutterAnimation() {
    this.stopAnimation();
    this.animTimer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.ufoFrames.length;
      if (this.currentChunk) {
        this.renderCurrentPosition("reading");
      }
    }, 450);
  }

  private stopAnimation() {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
  }

  private renderCurrentPosition(mood: "reading" | "paused" | "finished") {
    const editor = this.currentEditor || vscode.window.activeTextEditor;
    if (!editor || !this.currentChunk) {
      return;
    }

    try {
      const doc = editor.document;
      const totalLen = doc.getText().length;
      const computedStart = Math.min(totalLen, Math.max(0, this.baseOffset + this.currentChunk.startOffset));
      const computedEnd = Math.min(totalLen, Math.max(computedStart, this.baseOffset + this.currentChunk.endOffset));

      const startPos = doc.positionAt(computedStart);
      const endPos = doc.positionAt(computedEnd);
      const range = new vscode.Range(startPos, endPos);

      // Clean up previous pet label decoration
      if (this.petDecoration) {
        this.petDecoration.dispose();
      }

      // Build cute badge text
      let badgeText = "";
      let borderColor = "rgba(56, 189, 248, 0.6)";

      if (mood === "reading") {
        const ufo = this.ufoFrames[this.frameIndex % this.ufoFrames.length];
        const face = this.alienEmoticons[this.frameIndex % this.alienEmoticons.length];
        const progress = this.totalChunks > 0 ? ` [${this.currentChunk.index + 1}/${this.totalChunks}]` : "";
        badgeText = `  ${ufo} 👾 Cosmo: ${face} Reading${progress} ~♪`;
      } else if (mood === "paused") {
        badgeText = `  🛸💤 👾 Cosmo: (｡- . -｡) Paused...`;
        borderColor = "rgba(251, 191, 36, 0.7)";
      } else if (mood === "finished") {
        badgeText = `  🛸🎉 👾 Cosmo: (｡◕‿◕｡)★ Finished reading!`;
        borderColor = "rgba(74, 222, 128, 0.8)";
      }

      // Create new dynamic flying pet decoration
      this.petDecoration = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: badgeText,
          color: new vscode.ThemeColor("editorInfo.foreground"),
          fontWeight: "bold",
          margin: "0 0 0 14px"
        }
      });

      // Apply range highlight and pet badge
      editor.setDecorations(this.highlightDecoration, [range]);
      editor.setDecorations(this.petDecoration, [new vscode.Range(endPos, endPos)]);

      // Smoothly follow the flying pet
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch {
      // In case offsets don't match document bounds
    }
  }

  public clear() {
    this.stopAnimation();
    this.baseOffset = 0;
    this.currentChunk = null;
    const editor = this.currentEditor || vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.highlightDecoration, []);
      if (this.petDecoration) {
        editor.setDecorations(this.petDecoration, []);
      }
    }
    if (this.petDecoration) {
      this.petDecoration.dispose();
      this.petDecoration = null;
    }
  }

  public dispose() {
    this.clear();
    this.highlightDecoration.dispose();
  }
}
