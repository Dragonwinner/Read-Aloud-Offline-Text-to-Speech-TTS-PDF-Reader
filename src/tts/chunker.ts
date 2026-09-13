import { TextChunk } from "../types";

export interface ChunkOptions {
  maxChunkChars?: number;
  minChunkChars?: number;
}

export function chunkTextIntoSentences(fullText: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = options.maxChunkChars || 250;
  const minChars = options.minChunkChars || 40;

  if (!fullText || fullText.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  // Regex to split on sentence boundaries (. ! ? \n) while keeping natural groups
  const sentenceRegex = /[^.!?\n]+(?:[.!?]+|\n+|$)/g;
  let match: RegExpExecArray | null;

  let currentBuffer = "";
  let currentStartOffset = 0;
  let chunkIndex = 0;

  while ((match = sentenceRegex.exec(fullText)) !== null) {
    const segment = match[0];
    const matchOffset = match.index;

    if (currentBuffer.length === 0) {
      currentStartOffset = matchOffset;
    }

    // Check if adding this segment exceeds maximum chunk size
    if (currentBuffer.length + segment.length > maxChars && currentBuffer.length >= minChars) {
      const trimmed = currentBuffer.trim();
      if (trimmed.length > 0) {
        chunks.push({
          index: chunkIndex++,
          text: trimmed,
          startOffset: currentStartOffset,
          endOffset: currentStartOffset + currentBuffer.length
        });
      }
      currentBuffer = segment;
      currentStartOffset = matchOffset;
    } else {
      currentBuffer += segment;
    }
  }

  // Flush remaining buffer
  const finalTrimmed = currentBuffer.trim();
  if (finalTrimmed.length > 0) {
    chunks.push({
      index: chunkIndex++,
      text: finalTrimmed,
      startOffset: currentStartOffset,
      endOffset: currentStartOffset + currentBuffer.length
    });
  }

  return chunks;
}
