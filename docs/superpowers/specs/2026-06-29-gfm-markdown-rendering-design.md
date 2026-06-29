# GFM Markdown Rendering — Design

Replace Druckform's minimal hand-rolled Markdown→LaTeX converter with a full GitHub Flavored Markdown (GFM) converter built on `markdown-it`, so that tables and the other standard extended-markdown elements render correctly.

---

## 1. Problem

`packages/druckform/src/latex/md-to-latex.ts` is a deliberately minimal, line-based converter. It handles only: paragraphs, bold, italic, inline code, headings (h1–h4), and unordered lists. Every other element falls through to a "plain line" branch and is emitted as an escaped paragraph.

The visible symptom: a GFM table (`| A | B |` + `|---|---|`) is rendered as literal text with escaped pipes instead of a table. The same is true for ordered lists, links, images, blockquotes, fenced code blocks, horizontal rules, nested lists, task lists, and strikethrough.

Goal: documents render **full GFM** — all CommonMark block/inline elements plus the GFM extensions (tables, task lists, strikethrough, autolinks).

## 2. Approach

Adopt a real Markdown parser (`markdown-it`) and write a custom LaTeX emitter over its token stream. Rejected alternatives:

- **Extend the hand-rolled converter** — hand-writing a correct Markdown parser (nesting, GFM table alignment, fence handling, escaping interactions) is a well-known trap and a long-term bug source. Rejected.
- **remark + remark-gfm (mdast)** — cleanest typed AST, but ~30 transitive packages and a heavier bundle for a CLI distributed via `tsup`. Rejected in favor of the lighter `markdown-it`.

## 3. Architecture & Integration

The public entry point keeps its shape so the rest of the pipeline is untouched:

```
mdToLatex(md: string, assetsRoot: string): string
```

(The `assetsRoot` parameter is added so images can be resolved safely; `composer.ts` already knows the assets root and passes it through.)

- **`md-to-latex.ts`** — configures a shared `markdown-it` instance and delegates rendering to the new emitter.
- **`tokens-to-latex.ts`** (new) — walks the markdown-it token stream and emits LaTeX. Reuses `escapeTeX` (from `sdk/tex.ts`) for all literal text and `resolveAssetPath` (from `sdk/asset-path.ts`) for image references.

`markdown-it` configuration:
- `html: false` — raw HTML is not passed through (out of scope and unsafe in a LaTeX context). HTML blocks/inline are escaped as literal text.
- `linkify: true` — bare URLs become links.
- Tables and strikethrough are enabled by default in markdown-it's GFM-compatible defaults.
- `markdown-it-task-lists` plugin for `- [ ]` / `- [x]`.

**Parsing order is unaffected.** `parser.ts` strips `:::` component blocks first and only the text *between* components reaches `mdToLatex`, so markdown-it never sees the non-standard `:::` syntax. No conflict.

## 4. Element → LaTeX Mapping

| Element | LaTeX | New package |
|---|---|---|
| Headings h1–h6 | `\section` … `\subparagraph` | — |
| Bold / italic | `\textbf{}` / `\textit{}` | — |
| Inline code | `\texttt{}` (escaped) | — |
| Strikethrough `~~x~~` | `\sout{}` | `ulem` (with `normalem`) |
| Link `[t](u)` / autolink | `\href{u}{t}` / `\url{u}` | `hyperref` |
| Image `![a](src)` | `\includegraphics[...]{path}` via `resolveAssetPath` | graphicx (already loaded) |
| Unordered / ordered list | `itemize` / `enumerate` (nest natively) | — |
| Nested lists | native environment nesting | — |
| Task list | `\item[$\square$]` / `\item[$\boxtimes$]` | `amssymb` |
| Blockquote | `quote` environment | — |
| Fenced / indented code block | `lstlisting` (listings) | `listings` |
| Table | `tabularx` to `\linewidth` + `booktabs` rules; header row bold; per-column L/C/R alignment from the delimiter row | `tabularx`, `booktabs` |
| Horizontal rule | `\noindent\rule{\linewidth}{0.4pt}` | — |

**Decisions:**
- **Tables: `tabularx` auto-wrap.** Columns stretch to fill `\linewidth` so wide tables wrap instead of overflowing the page. Alignment from the GFM delimiter row maps to `>{\raggedright}`/`\centering`/`>{\raggedleft}` column variants.
- **Code blocks: `listings`.** Robust special-character handling, line wrapping, and a monospace box. `minted` is explicitly excluded because it requires shell-escape, which the renderer disables via `--untrusted`.

**Packages** are always-loaded in the base preamble in `composer.ts`. This is safe because the renderer now runs Tectonic with network access (the `--only-cached` flag was removed), so any package not already cached downloads on demand on first render.

## 5. Escaping & Safety

- All literal text from tokens passes through `escapeTeX`.
- Code spans and code blocks emit verbatim/`listings` content without LaTeX-escaping their bodies (listings handles specials), but fence info strings and inline-code are bounded so they cannot inject commands.
- Image refs go through `resolveAssetPath`, which already rejects absolute paths and path-traversal outside the assets root.
- `html: false` ensures embedded HTML cannot reach LaTeX as raw commands.

## 6. Testing

- **`tokens-to-latex.test.ts`** (new) — one focused unit test per element type (heading levels, ordered/unordered/nested lists, task list, table with each alignment, link, autolink, image, blockquote, code block, inline code, strikethrough, hr), asserting the emitted LaTeX. Mirrors the style of the existing `tex.test.ts`.
- **`integration/render.test.ts`** (extend) — add a kitchen-sink document that exercises every element and compile it to a real PDF, asserting success. Network is available for package fetch.
- Existing tests must continue to pass (the `mdToLatex` contract is preserved).

## 7. Out of Scope

- Raw HTML passthrough.
- Footnotes, definition lists, and other non-GFM extensions (can be added later behind the same emitter).
- Syntax-highlighting themes for code blocks beyond `listings`' basic styling.
- Math (`$...$`) — not part of this work unless already handled elsewhere.

## 8. Risks

- **markdown-it token stream is flat**, not a tree. The emitter must track nesting depth (lists, blockquotes) via the `_open`/`_close` token pairs. Mitigated by a small explicit stack in `tokens-to-latex.ts` and thorough nesting tests.
- **Table cell content** may itself contain inline markdown (bold, code, links). The emitter renders inline children per cell rather than treating cells as plain text.
- **First render is slower** now that packages download on demand; acceptable trade-off, documented in the README.
