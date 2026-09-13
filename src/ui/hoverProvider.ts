import * as vscode from "vscode";

export class AlishaHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      return null;
    }

    const selection = editor.selection;
    const hasSelection = selection && !selection.isEmpty;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    // Case 1: Mouse hovering over or near selected text
    if (hasSelection && (selection.contains(position) || (position.line >= selection.start.line && position.line <= selection.end.line))) {
      md.appendMarkdown(`### 🔊 **ALISHA Voice Reader**\n\n`);
      md.appendMarkdown(
        `[$(play) **Read Selected Text**](command:alishaVoice.readSelection "Read highlighted text with offline neural voice") &nbsp;&nbsp;|&nbsp;&nbsp; ` +
        `[$(debug-pause) Pause/Resume](command:alishaVoice.pauseResume "Pause or resume playback") &nbsp;&nbsp;|&nbsp;&nbsp; ` +
        `[$(debug-stop) Stop](command:alishaVoice.stop "Stop current playback") &nbsp;&nbsp;|&nbsp;&nbsp; ` +
        `[$(account) Switch Voice](command:alishaVoice.toggleVoice "Switch between Male and Female voice")`
      );

      return new vscode.Hover(md, selection);
    }

    // Case 2: Mouse hovering over any text without selection
    const lineText = document.lineAt(position.line).text.trim();
    if (!lineText) {
      return null;
    }

    md.appendMarkdown(`### 🔊 **ALISHA Voice Reader**\n\n`);
    md.appendMarkdown(
      `[$(play) **Read From Here**](command:alishaVoice.readFromCursor "Read document aloud starting from this line") &nbsp;&nbsp;|&nbsp;&nbsp; ` +
      `[$(book) Read Entire File](command:alishaVoice.readFile "Read entire document") &nbsp;&nbsp;|&nbsp;&nbsp; ` +
      `[$(debug-stop) Stop](command:alishaVoice.stop "Stop playback")`
    );

    const wordRange = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
    return new vscode.Hover(md, wordRange);
  }
}
