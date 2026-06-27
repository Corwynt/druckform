import { escapeTeX } from "../sdk/tex.js";

/**
 * Minimal Markdown → LaTeX converter for text nodes.
 * Handles: paragraphs, bold, italic, inline code, headings (h1-h4), unordered lists.
 * Diagram fences are replaced by their \includegraphics refs before this runs.
 */
export function mdToLatex(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      if (inList) {
        out.push("\\end{itemize}");
        inList = false;
      }
      const level = headingMatch[1]!.length;
      const cmds = ["section", "subsection", "subsubsection", "paragraph"];
      const cmd = cmds[level - 1] ?? "paragraph";
      out.push(`\\${cmd}{${inlineMarkdown(headingMatch[2]!)}}`);
      continue;
    }

    // Unordered list items
    const listMatch = /^[-*]\s+(.+)$/.exec(line);
    if (listMatch) {
      if (!inList) {
        out.push("\\begin{itemize}");
        inList = true;
      }
      out.push(`  \\item ${inlineMarkdown(listMatch[1]!)}`);
      continue;
    }

    if (inList && line.trim() === "") {
      out.push("\\end{itemize}");
      inList = false;
    }

    // Blank line = paragraph break
    if (line.trim() === "") {
      out.push("");
      continue;
    }

    out.push(inlineMarkdown(line));
  }

  if (inList) out.push("\\end{itemize}");
  return out.join("\n");
}

/**
 * Convert inline markdown (bold, italic, code) to LaTeX, escaping plain text.
 * Processes markdown patterns first, then escapes remaining plain-text segments.
 */
function inlineMarkdown(text: string): string {
  const parts: string[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Escape plain text before this match
    if (match.index > lastIndex) {
      parts.push(escapeTeX(text.slice(lastIndex, match.index)));
    }

    const full = match[0]!;
    if (full.startsWith("**")) {
      parts.push(`\\textbf{${escapeTeX(match[1]!)}}`);
    } else if (full.startsWith("*")) {
      parts.push(`\\textit{${escapeTeX(match[2]!)}}`);
    } else {
      // backtick code span
      parts.push(`\\texttt{${escapeTeX(match[3]!)}}`);
    }

    lastIndex = pattern.lastIndex;
  }

  // Escape any remaining plain text after the last match
  if (lastIndex < text.length) {
    parts.push(escapeTeX(text.slice(lastIndex)));
  }

  return parts.join("");
}
