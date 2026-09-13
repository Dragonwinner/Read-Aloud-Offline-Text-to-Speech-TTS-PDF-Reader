import * as vscode from "vscode";
import { TextChunk } from "../types";

export class EditorHighlighter {
  private decorationType: vscode.TextEditorDecorationType;
  private currentEditor: vscode.TextEditor | undefined;
  private baseOffset: number = 0;

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
      border: "1px solid var(--vscode-editor-findMatchHighlightBorder, rgba(255, 215, 0, 0.6))",
      borderRadius: "3px"
    });
  }

  public setEditor(editor: vscode.TextEditor | undefined) {
    this.currentEditor = editor;
  }

  public setBaseOffset(offset: number) {
    this.baseOffset = Math.max(0, offset);
  }

  public highlightChunk(chunk: TextChunk) {
    const config = vscode.workspace.getConfiguration("alishaVoice");
    const enabled = config.get<boolean>("highlightActiveText", true);
    if (!enabled) {
      return;
    }

    const editor = this.currentEditor || vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    try {
      const doc = editor.document;
      const totalLen = doc.getText().length;
      const computedStart = Math.min(totalLen, Math.max(0, this.baseOffset + chunk.startOffset));
      const computedEnd = Math.min(totalLen, Math.max(computedStart, this.baseOffset + chunk.endOffset));

      const startPos = doc.positionAt(computedStart);
      const endPos = doc.positionAt(computedEnd);
      const range = new vscode.Range(startPos, endPos);

      editor.setDecorations(this.decorationType, [range]);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch {
      // In case offsets don't match document length (e.g. external PDF)
    }
  }

  public clear() {
    this.baseOffset = 0;
    const editor = this.currentEditor || vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.decorationType, []);
    }
  }

  public dispose() {
    this.clear();
    this.decorationType.dispose();
  }
}
