import removeMarkdown from "remove-markdown";

export interface MarkdownSanitizeOptions {
  skipCodeBlocks?: boolean;
}

export function sanitizeMarkdown(rawMarkdown: string, options: MarkdownSanitizeOptions = {}): string {
  if (!rawMarkdown) {
    return "";
  }

  let text = rawMarkdown;

  // 1. Remove YAML / TOML Frontmatter
  text = text.replace(/^---[\s\S]*?---\s*/, "");
  text = text.replace(/^\+\+\+[\s\S]*?\+\+\+\s*/, "");

  // 2. Handle fenced code blocks (both closed and unclosed at end of selection)
  if (options.skipCodeBlocks !== false) {
    // Replace fenced code blocks (even if unclosed at end of selected text)
    text = text.replace(/```[a-zA-Z0-9_-]*\n?[\s\S]*?(?:```|$)/g, " [Code block omitted.] ");
    // Replace inline code backticks
    text = text.replace(/`([^`]+)`/g, "$1");
    text = text.replace(/`/g, "");
  } else {
    text = text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)(?:```|$)/g, "$1");
    text = text.replace(/`([^`]+)`/g, "$1");
    text = text.replace(/`/g, "");
  }

  // 3. LaTeX Math formatting (e.g. $24 - 3 = \mathbf{21 \text{ bits}}$)
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " [Formula omitted.] ");
  text = text.replace(/\$([^$\n]+)\$/g, (_match, math) => {
    return math
      .replace(/\\mathbf\{([^}]+)\}/g, "$1")
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .replace(/\\math[a-zA-Z]*\{([^}]+)\}/g, "$1")
      .replace(/\\times/g, " times ")
      .replace(/\\div/g, " divided by ")
      .replace(/\\le/g, " less than or equal to ")
      .replace(/\\ge/g, " greater than or equal to ")
      .replace(/\\neq/g, " not equal to ")
      .replace(/\\([a-zA-Z]+)/g, " $1 ")
      .replace(/[{}]/g, "")
      .trim();
  });

  // 4. Markdown links: [foo_bar.md](url) -> "foo bar"
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, (_match, linkText) => {
    return linkText.replace(/\.(md|markdown|txt|pdf)/gi, "").replace(/[_-]/g, " ");
  });

  // 5. Remove raw URLs if any remain
  text = text.replace(/(?:https?|file):\/\/[^\s)]+/g, " ");

  // 6. Strip blockquote symbols (>)
  text = text.replace(/^\s*>\s*/gm, "");

  // 7. Strip horizontal rules
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, " ");

  // 8. Strip ASCII art borders and table dividers (+---+, |---|)
  text = text.replace(/^\s*[+\-|_=~┌─┐│└─┘├─┤┬┴┼]{3,}\s*$/gm, " ");
  text = text.replace(/^[+|][\s\-+=|]{3,}[+|]?$/gm, " ");

  // 9. Em-dashes / en-dashes -> natural breath pauses
  text = text.replace(/[—–]/g, ", ");

  // 10. Remove HTML tags if present
  text = text.replace(/<[^>]+>/g, " ");

  // 11. Strip standard Markdown syntax (headers, bold, italics, tables, lists)
  const cleaned = removeMarkdown(text, {
    stripListLeaders: true,
    listUnicodeChar: "",
    gfm: true,
    useImgAltText: true
  });

  // 12. Strip table pipes into natural breath commas
  let finalCleaned = cleaned.replace(/\|/g, ", ");

  // 13. Clean leftover repeated punctuation or symbols
  finalCleaned = finalCleaned.replace(/[-+]{2,}/g, " ");

  // 14. Clean extra whitespaces and broken line gaps
  return finalCleaned
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
