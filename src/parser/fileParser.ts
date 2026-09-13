import * as vscode from "vscode";
import * as path from "path";
import { sanitizeMarkdown } from "./markdownSanitizer";
import { extractTextFromPdf } from "./pdfExtractor";

export interface ParsedDocument {
  sourceType: "txt" | "md" | "pdf" | "selection";
  filePath?: string;
  fileName: string;
  rawText: string;
  speechText: string;
}

export async function parseDocumentSource(
  targetUri?: vscode.Uri,
  selectionText?: string,
  skipCodeBlocks: boolean = true
): Promise<ParsedDocument> {
  // Case 1: Active text selection passed directly
  if (selectionText && selectionText.trim().length > 0) {
    const editor = vscode.window.activeTextEditor;
    const isMarkdown = editor?.document.languageId === "markdown";
    const speechText = isMarkdown
      ? sanitizeMarkdown(selectionText, { skipCodeBlocks })
      : selectionText.trim();

    return {
      sourceType: "selection",
      fileName: "Selected Text",
      rawText: selectionText,
      speechText
    };
  }

  // Case 2: Specific URI or active editor document
  const uri = targetUri || vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    throw new Error("No file or active editor selected.");
  }

  const ext = path.extname(uri.fsPath).toLowerCase();
  const fileName = path.basename(uri.fsPath);

  if (ext === ".pdf") {
    const speechText = await extractTextFromPdf(uri.fsPath);
    return {
      sourceType: "pdf",
      filePath: uri.fsPath,
      fileName,
      rawText: speechText,
      speechText
    };
  }

  // Text or Markdown from workspace filesystem
  const fileBytes = await vscode.workspace.fs.readFile(uri);
  const rawContent = Buffer.from(fileBytes).toString("utf-8");

  if (ext === ".md" || ext === ".markdown") {
    const speechText = sanitizeMarkdown(rawContent, { skipCodeBlocks });
    return {
      sourceType: "md",
      filePath: uri.fsPath,
      fileName,
      rawText: rawContent,
      speechText
    };
  }

  if (ext === ".txt" || ext === "" || ext === ".log") {
    return {
      sourceType: "txt",
      filePath: uri.fsPath,
      fileName,
      rawText: rawContent,
      speechText: rawContent.trim()
    };
  }

  // Fallback for code files / other plain text formats
  return {
    sourceType: "txt",
    filePath: uri.fsPath,
    fileName,
    rawText: rawContent,
    speechText: rawContent.trim()
  };
}
