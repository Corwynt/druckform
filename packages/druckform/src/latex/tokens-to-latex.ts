import MarkdownIt from "markdown-it";
import { resolveAssetPath } from "../sdk/asset-path.js";
import { escapeTeX } from "../sdk/tex.js";
import type { BlockElement, RenderCtx, ResolvedTemplate } from "../sdk/types.js";

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

export interface EmitOpts {
  template: ResolvedTemplate;
  ctx: RenderCtx;
  assetsRoot: string;
}

const ALIGN: Record<string, "left" | "center" | "right"> = {
  "text-align:left": "left",
  "text-align:center": "center",
  "text-align:right": "right",
};

// Escape characters that break hyperref's \href first argument.
function escapeUrl(url: string): string {
  return url.replace(/[\\{}%#&]/g, (c) => `\\${c}`);
}

export function tokensToLatex(tokens: Token[], opts: EmitOpts): string {
  return renderBlocks(tokens, 0, tokens.length, opts).trim();
}

function block(opts: EmitOpts, name: string, children: string, element: BlockElement): string {
  const entry = opts.template.components[name];
  if (!entry) {
    throw new Error(
      `Template '${opts.template.name}' is missing built-in component '${name}'. ` +
        `Templates must extend 'base'.`,
    );
  }
  return entry.def.render({}, children, opts.ctx, element);
}

// Index of the token whose nesting closes the container opened at `start`.
function matchClose(tokens: Token[], start: number): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    depth += tokens[i]?.nesting ?? 0;
    if (depth === 0) return i;
  }
  throw new Error("unbalanced markdown-it token stream");
}

function renderBlocks(tokens: Token[], start: number, end: number, opts: EmitOpts): string {
  const out: string[] = [];
  let i = start;
  while (i < end) {
    const t = tokens[i];
    if (!t) break;
    switch (t.type) {
      case "paragraph_open": {
        out.push(renderInline(tokens[i + 1], opts));
        i += 3; // open, inline, close
        break;
      }
      case "heading_open": {
        const level = Number(t.tag.slice(1));
        const children = renderInline(tokens[i + 1], opts);
        out.push(block(opts, "block:heading", children, { kind: "heading", level }));
        i += 3;
        break;
      }
      case "hr": {
        out.push(block(opts, "block:hr", "", { kind: "hr" }));
        i += 1;
        break;
      }
      case "blockquote_open": {
        const close = matchClose(tokens, i);
        const inner = renderBlocks(tokens, i + 1, close, opts);
        out.push(block(opts, "block:blockquote", inner, { kind: "blockquote" }));
        i = close + 1;
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        const close = matchClose(tokens, i);
        const ordered = t.type === "ordered_list_open";
        const startAttr = t.attrGet?.("start");
        const items: Array<{ content: string; task: "checked" | "unchecked" | null }> = [];
        let j = i + 1;
        while (j < close) {
          if (tokens[j]?.type === "list_item_open") {
            const itemClose = matchClose(tokens, j);
            let content = renderBlocks(tokens, j + 1, itemClose, opts).trim();
            let task: "checked" | "unchecked" | null = null;
            const m = /^\[([ xX])\]\s+/.exec(content);
            if (m) {
              task = m[1] === " " ? "unchecked" : "checked";
              content = content.slice(m[0].length);
            }
            items.push({ content, task });
            j = itemClose + 1;
          } else {
            j++;
          }
        }
        out.push(
          block(opts, "block:list", "", {
            kind: "list",
            ordered,
            start: startAttr ? Number(startAttr) : null,
            items,
          }),
        );
        i = close + 1;
        break;
      }
      case "table_open": {
        const close = matchClose(tokens, i);
        out.push(renderTable(tokens, i, close, opts));
        i = close + 1;
        break;
      }
      case "fence":
      case "code_block": {
        const info = t.info?.trim().split(/\s+/)[0] || null;
        out.push(
          block(opts, "block:codeblock", "", {
            kind: "codeblock",
            language: info,
            code: t.content.replace(/\n$/, ""),
          }),
        );
        i += 1;
        break;
      }
      case "html_block": {
        out.push(escapeTeX(t.content));
        i += 1;
        break;
      }
      default:
        i += 1;
    }
  }
  return out.join("\n\n");
}

function renderTable(tokens: Token[], open: number, close: number, opts: EmitOpts): string {
  const alignments: Array<"left" | "center" | "right" | null> = [];
  const header: string[] = [];
  const rows: string[][] = [];
  let inHead = false;
  let current: string[] | null = null;

  for (let i = open + 1; i < close; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open") current = [];
    else if (t.type === "tr_close") {
      if (current) {
        if (inHead) header.push(...current);
        else rows.push(current);
      }
      current = null;
    } else if (t.type === "th_open" || t.type === "td_open") {
      const cell = renderInline(tokens[i + 1], opts);
      current?.push(cell);
      if (inHead) {
        const style = t.attrGet?.("style") ?? "";
        alignments.push(ALIGN[style] ?? null);
      }
      i += 1; // skip the inline token we just consumed
    }
  }
  return block(opts, "block:table", "", { kind: "table", alignments, header, rows });
}

function renderInline(token: Token | undefined, opts: EmitOpts): string {
  if (!token || !token.children) return token ? escapeTeX(token.content) : "";
  let out = "";
  for (const c of token.children) {
    switch (c.type) {
      case "text":
        out += escapeTeX(c.content);
        break;
      case "softbreak":
        out += " ";
        break;
      case "hardbreak":
        out += "\\\\\n";
        break;
      case "code_inline":
        out += `\\texttt{${escapeTeX(c.content)}}`;
        break;
      case "strong_open":
        out += "\\textbf{";
        break;
      case "strong_close":
        out += "}";
        break;
      case "em_open":
        out += "\\textit{";
        break;
      case "em_close":
        out += "}";
        break;
      case "s_open":
        out += "\\sout{";
        break;
      case "s_close":
        out += "}";
        break;
      case "link_open":
        out += `\\href{${escapeUrl(c.attrGet?.("href") ?? "")}}{`;
        break;
      case "link_close":
        out += "}";
        break;
      case "image": {
        const ref = c.attrGet?.("src") ?? "";
        let src = ref;
        try {
          src = resolveAssetPath(opts.assetsRoot, ref);
        } catch {
          src = ref;
        }
        out += block(opts, "block:image", "", {
          kind: "image",
          src,
          alt: c.content,
          title: c.attrGet?.("title") || null,
        });
        break;
      }
      case "html_inline":
        out += escapeTeX(c.content);
        break;
      default:
        break;
    }
  }
  return out;
}
