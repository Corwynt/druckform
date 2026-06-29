# GFM Markdown Rendering — Design

Replace Druckform's minimal hand-rolled Markdown→LaTeX converter with a full GitHub Flavored Markdown (GFM) converter built on `markdown-it`, and model the block-level elements as **overrideable template components** so their LaTeX rendering participates in the template extension chain.

---

## 1. Problem

`packages/druckform/src/latex/md-to-latex.ts` is a deliberately minimal, line-based converter. It handles only: paragraphs, bold, italic, inline code, headings (h1–h4), and unordered lists. Every other element falls through to a "plain line" branch and is emitted as an escaped paragraph.

The visible symptom: a GFM table (`| A | B |` + `|---|---|`) is rendered as literal text with escaped pipes instead of a table. The same is true for ordered lists, links, images, blockquotes, fenced code blocks, horizontal rules, nested lists, task lists, and strikethrough.

Goals:
1. Documents render **full GFM** — all CommonMark block/inline elements plus the GFM extensions (tables, task lists, strikethrough, autolinks).
2. The LaTeX rendering of block-level elements is **overrideable by templates** through the same extension chain that already governs `:::` components, so a template can restyle tables, code blocks, etc.

## 2. Approach

Adopt a real Markdown parser (`markdown-it`) and write a custom LaTeX emitter over its token stream. The emitter does not hardcode the LaTeX for block-level elements; instead it dispatches each block element to a **built-in element component** resolved from the active template, which a template may override.

Rejected alternatives:
- **Extend the hand-rolled converter** — hand-writing a correct Markdown parser (nesting, GFM table alignment, fence handling, escaping interactions) is a well-known trap and a long-term bug source. Rejected.
- **remark + remark-gfm (mdast)** — cleanest typed AST, but ~30 transitive packages and a heavier bundle for a CLI distributed via `tsup`. Rejected in favor of the lighter `markdown-it`.
- **Macro-redefinition for overrides** (base template defines `\dfTable` etc.; templates redefine in preamble) — overrides would live in raw LaTeX and preamble merge order is not chain-ordered today. Rejected in favor of modeling elements as real components.

## 3. Architecture & Integration

### 3.1 Parsing

- Add `markdown-it` (+ `markdown-it-task-lists` for `- [ ]` / `- [x]`).
- Configure with `html: false` (raw HTML escaped, not passed through), `linkify: true` (autolinks). GFM tables and strikethrough are enabled by markdown-it's defaults.
- Parsing order is unaffected: `parser.ts` strips `:::` component blocks first, so markdown-it only ever sees clean markdown in text nodes — no conflict with the `:::` syntax.

### 3.2 Emitter and dispatch

A new `tokens-to-latex.ts` walks the markdown-it token stream. Its signature change ripples up to `mdToLatex`:

```
mdToLatex(md: string, opts: {
  template: ResolvedTemplate,   // for block-element component lookup
  ctx: RenderCtx,
  assetsRoot: string,           // image path resolution
}): string
```

`composer.ts` already holds `template` and `ctx`, so it passes them through. For each token:

- **Inline marks** (bold, italic, inline code, strikethrough, link, autolink) — emitted directly by the emitter, reusing `escapeTeX`. These are fixed (not overrideable).
- **Block-level elements** (table, code block, blockquote, heading, list, horizontal rule, image) — the emitter builds a typed payload and calls the corresponding built-in element component resolved from `template.components`.

## 4. Built-in Element Components & the Extension Chain

### 4.1 Registration

Each overrideable block element is a component with a default definition, shipped in the **base template** (`templates/base/components/`) and referenced from `templates/base/template.yaml` under a **reserved `block:` namespace**:

`block:table`, `block:codeblock`, `block:blockquote`, `block:heading`, `block:list`, `block:hr`, `block:image`.

Because these live in the base template's `components` map, they flow through `resolver.ts` exactly like `infobox`/`callout`: every template inherits them, and any template in the chain may override one — totally (`source:`) or partially (`extends:` + `defaults:`). Component names beginning with `block:` are reserved; user components must not use the prefix (validated at load time).

### 4.2 Contract extension

The component render contract gains an optional typed payload, supplied only for built-in element components. Existing user components are unchanged (they ignore the new argument):

```ts
export type BlockElement =
  | { kind: "table"; alignments: Array<"left" | "center" | "right" | null>;
      header: string[]; rows: string[][] }   // cells are pre-rendered inline LaTeX
  | { kind: "codeblock"; language: string | null; code: string }   // raw code
  | { kind: "list"; ordered: boolean; start: number | null;
      items: string[] }                       // items are pre-rendered LaTeX
  | { kind: "heading"; level: number }         // content via `children`
  | { kind: "blockquote" }                     // content via `children`
  | { kind: "image"; src: string; alt: string; title: string | null } // src = resolved path
  | { kind: "hr" };

export type RenderFn = (
  params: Record<string, string>,
  children: string,
  ctx: RenderCtx,
  element?: BlockElement,   // present only for built-in element components
) => string;
```

Convention: array-structured elements (table, list) carry their data in the payload; container elements (blockquote, heading) receive rendered inner content via `children`; inline content inside cells/items is pre-rendered by the emitter so an override controls only the element's own structure.

### 4.3 Packages via component preambles

Each element component declares the LaTeX packages it needs in its `preamble` (collected and deduplicated by `composer.ts` as today) rather than hardcoding them in the composer:

| Component | Default LaTeX | Package(s) in its preamble |
|---|---|---|
| `block:table` | `tabularx` to `\linewidth` + `booktabs` rules; bold header; L/C/R from delimiter row | `tabularx`, `booktabs`, `array` |
| `block:codeblock` | `lstlisting` | `listings` |
| `block:blockquote` | `quote` | — |
| `block:heading` | `\section`…`\subparagraph` (levels 1–6) | — |
| `block:list` | `itemize`/`enumerate`; task items via `$\square$`/`$\boxtimes$` | `amssymb` |
| `block:image` | `\includegraphics` (via `resolveAssetPath`) | graphicx (already loaded) |
| `block:hr` | `\noindent\rule{\linewidth}{0.4pt}` | — |

Links (`\href`/`\url`) are emitted inline by the emitter and need `hyperref`; strikethrough needs `ulem`. Since these are fixed (not components), their packages are added to the composer's fixed base preamble alongside `fontspec`/`xcolor`/`graphicx` (`hyperref`, and `ulem` with the `normalem` option). `minted` is excluded — it requires shell-escape, which `--untrusted` disables.

Always-loading is safe because the renderer now runs Tectonic with network access (the `--only-cached` flag was removed), so any package not already cached downloads on demand.

## 5. Escaping & Safety

- All literal text from inline tokens passes through `escapeTeX`.
- Code spans and `block:codeblock` content are emitted verbatim (listings handles specials); fence info strings and inline code are bounded so they cannot inject commands.
- `block:image` `src` goes through `resolveAssetPath`, which rejects absolute paths and traversal outside the assets root.
- `html: false` ensures embedded HTML cannot reach LaTeX as raw commands.
- Override components are template-authored (trusted), same trust level as today's `infobox`/`callout`.

## 6. Testing

- **`tokens-to-latex.test.ts`** (new) — one focused unit test per element (heading levels, ordered/unordered/nested lists, task list, table per alignment, link, autolink, image, blockquote, code block, inline code, strikethrough, hr), asserting emitted LaTeX against the base-template defaults.
- **Override test** — a fixture template that overrides `block:table` (and `block:codeblock`) and asserts the document picks up the override through the extension chain.
- **Reserved-namespace test** — a user component named `block:foo` is rejected at load time.
- **`integration/render.test.ts`** (extend) — a kitchen-sink document exercising every element, compiled to a real PDF.
- Existing tests must continue to pass; the `mdToLatex` contract change is internal (only `composer.ts` calls it).

## 7. Out of Scope

- Raw HTML passthrough.
- Footnotes, definition lists, and other non-GFM extensions (can be added later as more element components).
- Overrideable **inline** marks (bold/italic/code/strikethrough/link) — fixed in the emitter for now.
- Syntax-highlighting themes beyond `listings`' basic styling.
- Math (`$...$`).

## 8. Risks

- **Flat token stream.** markdown-it tokens are flat, not a tree; the emitter tracks nesting (lists, blockquotes) via `_open`/`_close` pairs using an explicit stack, covered by nesting tests.
- **Contract change.** Adding the optional `element` argument is backward compatible, but the `RenderFn` type and `ResolvedComponentEntry` plumbing touch the SDK types and `composer.ts`. Kept additive.
- **Source mapping granularity.** Converted text nodes are attributed to `"text"` in the source map (unchanged); per-element attribution is out of scope.
- **First render slower** now that packages download on demand; acceptable, documented in the README.
