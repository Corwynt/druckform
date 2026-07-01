import type MarkdownIt from "markdown-it";
import { parseDirectiveAttributes } from "../parse/directive-attrs.js";

// Matches an inline directive at the current position: :name , then REQUIRED
// [content] and/or {attrs} (at least one), name is letter-initial. The required
// bracket/brace is what prevents matching prose colons (10:30, localhost:8080).
const NAME = /^:([A-Za-z][\w-]*)/;

/**
 * markdown-it inline rule for generic-directive inline spans `:name[content]{attrs}`.
 * Emits a `directive_inline` token whose `.children` are the parsed inline tokens of
 * `[content]` and whose `.meta` carries `{ name, params }`. Rendering/registry lookup
 * happens later in tokens-to-latex.
 */
export function inlineDirectivePlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "directive_inline", (state, silent) => {
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x3a /* : */) return false;
    const nameMatch = NAME.exec(src.slice(pos));
    if (!nameMatch) return false;
    const name = nameMatch[1] as string;
    let cur = pos + nameMatch[0].length;

    // Optional [content]
    let content: string | null = null;
    if (src.charCodeAt(cur) === 0x5b /* [ */) {
      const close = src.indexOf("]", cur + 1);
      if (close === -1) return false;
      content = src.slice(cur + 1, close);
      cur = close + 1;
    }
    // Optional {attrs}
    let attrStr = "";
    if (src.charCodeAt(cur) === 0x7b /* { */) {
      const close = src.indexOf("}", cur + 1);
      if (close === -1) return false;
      attrStr = src.slice(cur + 1, close);
      cur = close + 1;
    }
    // Firing rule: require at least one of [content] / {attrs}.
    if (content === null && attrStr === "") return false;
    if (silent) return true;

    const token = state.push("directive_inline", "", 0);
    token.meta = { name, params: parseDirectiveAttributes(attrStr) };
    token.children = content ? (md.parseInline(content, state.env)[0]?.children ?? []) : [];
    state.pos = cur;
    return true;
  });
}
