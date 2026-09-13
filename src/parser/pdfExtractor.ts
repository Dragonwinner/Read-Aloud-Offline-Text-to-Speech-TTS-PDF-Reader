import * as fs from "fs";
import pdfParse from "pdf-parse";

export async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(dataBuffer);

  return cleanExtractedPdfText(pdfData.text || "");
}

export function cleanExtractedPdfText(rawText: string): string {
  if (!rawText) {
    return "";
  }

  let text = rawText;

  // 1. Normalize line breaks
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Fix hyphenated word breaks at end of line (e.g. "connec- \n tion" -> "connection")
  text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");

  // 3. Remove common header/footer page patterns (e.g., "Page 1 of 12", "--- Page 3 ---")
  text = text.replace(/(?:Page\s+\d+\s+of\s+\d+|\bPage\s+\d+\b)/gi, "");

  // 4. Group paragraphs: Double newlines are real paragraph breaks, single newlines are soft wraps
  const paragraphs = text.split(/\n\s*\n/);

  const cleanedParagraphs = paragraphs.map((para) => {
    // Join single wrapped lines within a paragraph with space
    return para
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }).filter((para) => para.length > 0);

  return cleanedParagraphs.join("\n\n");
}
