import MarkdownIt from "markdown-it";
import { type EmitOpts, tokensToLatex } from "./tokens-to-latex.js";

const md = new MarkdownIt({ html: false, linkify: true });

/**
 * Convert a Markdown text node to LaTeX. Inline marks are emitted directly;
 * block-level elements are dispatched to the active template's `block:*`
 * components so they can be overridden through the template extension chain.
 */
export function mdToLatex(src: string, opts: EmitOpts): string {
  return tokensToLatex(md.parse(src, {}), opts);
}
