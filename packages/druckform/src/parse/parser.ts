import fs from "node:fs";
import yaml from "js-yaml";
import type { ASTNode, ComponentBlock, ParsedDocument } from "../sdk/types.js";

const OPEN_RE = /^:::\s+(\S+)(.*)?$/;
const CLOSE_RE = /^:::$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = new RegExp(ATTR_RE.source, "g");
  for (let match = re.exec(attrStr); match !== null; match = re.exec(attrStr)) {
    attrs[match[1] ?? ""] = match[2] ?? "";
  }
  return attrs;
}

// Detects a leading `---` … `---` YAML frontmatter block. Only a `---` on the
// very first line with a later closing `---` counts; otherwise the leading `---`
// is ordinary content (e.g. a GFM horizontal rule). Body source-line numbers are
// preserved because the body is parsed from `bodyStart` against the same array.
function extractFrontmatter(lines: string[]): {
  frontmatter: Record<string, string>;
  bodyStart: number;
} {
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, bodyStart: 0 };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) return { frontmatter: {}, bodyStart: 0 };
  const parsed = (yaml.load(lines.slice(1, close).join("\n")) ?? {}) as Record<string, unknown>;
  const frontmatter: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && typeof v !== "object") frontmatter[k] = String(v);
  }
  return { frontmatter, bodyStart: close + 1 };
}

export function parseDocument(filePath: string): ParsedDocument {
  return parseMarkdownString(fs.readFileSync(filePath, "utf8"));
}

export function parseMarkdownString(content: string): ParsedDocument {
  const lines = content.split("\n");
  const { frontmatter, bodyStart } = extractFrontmatter(lines);
  const [nodes] = parseLines(lines, bodyStart);
  return { nodes, frontmatter };
}

function parseLines(lines: string[], startLine: number): [ASTNode[], number] {
  const nodes: ASTNode[] = [];
  let i = startLine;
  let textBuf: string[] = [];
  let textStartLine = i + 1;

  const flushText = () => {
    const content = textBuf.join("\n").trim();
    if (content) {
      nodes.push({ type: "text", content, sourceLine: textStartLine });
    }
    textBuf = [];
    textStartLine = i + 1;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const openMatch = OPEN_RE.exec(line);
    const closeMatch = CLOSE_RE.test(line) && !openMatch;

    if (closeMatch) {
      flushText();
      return [nodes, i]; // caller consumes the :::
    }

    if (openMatch) {
      flushText();
      const name = openMatch[1] ?? "";
      const attrStr = openMatch[2] ?? "";
      const params = parseAttrs(attrStr);
      const sourceLine = i + 1;
      i++;
      const [children, closedAt] = parseLines(lines, i);
      i = closedAt + 1; // skip the closing :::
      const block: ComponentBlock = { name, params, children, sourceLine };
      nodes.push({ type: "component", block });
      textStartLine = i + 1;
      continue;
    }

    textBuf.push(line);
    i++;
  }

  flushText();
  return [nodes, i];
}
