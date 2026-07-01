# Diagram pipeline fixes — design

**Date:** 2026-07-01
**Author:** torben (with Claude)
**Status:** Approved design, awaiting implementation plan
**Relates to:** Part A (template-bundled assets) and the earlier diagram-placeholder fix (commit 9638278). Follows [[druckform-theme-feedback-followups]]. Surfaced while rendering a 61-diagram document with the `gradion` template.

## Problem

Four defects in the druckform diagram pipeline (all in `packages/druckform/src/...`, not in user templates), each reproduced and root-caused:

1. **Mermaid node labels vanish.** `renderMermaid` runs `mmdc` to produce SVG, then converts SVG→PDF with `rsvg-convert` (librsvg) (`src/diagram/mermaid.ts:19,28`). Modern Mermaid renders flowchart/class/state labels as HTML inside `<foreignObject>`, which **librsvg does not support** — so every label is silently dropped. Shapes (pure SVG) survive; text is lost. Verified: `mmdc` default → 1 `foreignObject`, 0 `<text>`; with `htmlLabels:false` → 0 `foreignObject`, 1 `<text>`.
2. **Template Mermaid brand colours are ignored.** The style schema accepts `diagrams.mermaid.themeVariablesRef` (`src/style/validate.ts:46`, `src/sdk/types.ts:71`), but `renderMermaid` only reads `theme` and passes `-t` (`mermaid.ts:18-19`). `themeVariablesRef` is never loaded and `themeVariables` are never passed to `mmdc`, so a template can pick a named theme but cannot apply brand colours.
3. **Tall diagrams overflow the page.** The composer emits diagram includes as `\includegraphics[width=\linewidth]{…}` (`src/latex/composer.ts:140`) with no height constraint. A portrait diagram scaled to full text width becomes taller than the text height and collides with the footer / runs off the page. Images (`block:image`) have the same latent risk.
4. **No per-instance height control from markdown.** Authors cannot bound a single oversized image or diagram from markdown — there is no width/height channel today.

## Goal

Make Mermaid diagrams render their labels and honour brand colours, stop diagrams and images from overflowing the page by default, and give authors a per-instance height override from markdown. Document the resulting behaviour and its one real limitation (no rich-HTML Mermaid labels).

## Non-goals (YAGNI)

- The headless-Chromium SVG→PDF path for Issue 1 (heavier dependency) — the `htmlLabels:false` fix is the pragmatic call.
- A first-class style-token/`DocumentLayout` field for the height cap — an overridable LaTeX macro handles it with far less surface.

## Design

### Issue 1 — Mermaid labels (emit SVG `<text>`, not HTML)

`renderMermaid` writes a per-diagram mmdc config file that always contains:

```json
{ "htmlLabels": false, "flowchart": { "htmlLabels": false } }
```

and passes `-c <configFile>` to `mmdc`. Mermaid then emits SVG `<text>` labels, which librsvg renders.

**Trade-off (documented):** `htmlLabels:false` disables rich HTML in labels (bold, links, `<br>`). That content cannot survive the SVG→PDF step regardless, so this is a limitation to document, not a regression.

### Issue 2 — Mermaid brand colours (`themeVariables`)

**Schema/types.** Add an inline `diagrams.mermaid.themeVariables` object (freeform string→string map) to `src/style/validate.ts` (add the property; keep `additionalProperties:false` otherwise) and to `StyleConfig.diagrams.mermaid` in `src/sdk/types.ts`. Keep the existing `themeVariablesRef`.

**Thread `styleDir`.** `prerenderDiagrams` already receives `styleDir` and passes it to `renderPlantUML` (`src/diagram/pre-render.ts:34`) but not to `renderMermaid` (`:27`). Pass it to `renderMermaid` too so a ref can be resolved.

**Resolve the variables.** Inline `themeVariables` wins; otherwise, if `themeVariablesRef` is set, read and JSON-parse the file resolved via `resolveAssetPath(styleDir, ref)` (mirroring `plantuml.skinRef`, `plantuml.ts:25`). A missing file or unparseable JSON throws a clear error (surfaced as a render Finding).

**Config assembly (unified with Issue 1).** The config file always carries the `htmlLabels:false` keys. Then:
- **If resolved `themeVariables` are present:** add `"theme": "base"` and `"themeVariables": {…}` to the config, and invoke `mmdc` with **`-c` only — no `-t`** (the CLI rejects `-t base`).
- **Otherwise:** invoke `mmdc -t <theme ?? "default"> -c <configFile>` (config carries no `theme` key; `-t` governs the named theme).

Both branches match verified `mmdc` invocations.

### Issue 3 — Default height cap (diagrams and images)

Two overridable LaTeX macros defined in the composer's engine-core preamble (`ENGINE_CORE`, `composer.ts:26`), each defaulting to `0.82\textheight`:

```latex
\newcommand{\druckDiagramMaxHeight}{0.82\textheight}
\newcommand{\druckImageMaxHeight}{0.82\textheight}
```

Because the composer emits engine-core *before* the document shell, any shell may `\renewcommand` either macro. They are separate so a theme can tune diagrams and images independently.

- **Diagrams** (`composer.ts:140`): emit `\begin{center}\includegraphics[width=\linewidth,height=\druckDiagramMaxHeight,keepaspectratio]{path}\end{center}`. graphicx-only (no adjustbox); `keepaspectratio` preserves the aspect ratio and only shrinks oversized diagrams.
- **Images** (`templates/base/components/block-image.ts`): emit `\includegraphics[max width=\linewidth, max totalheight=\druckImageMaxHeight]{src}`. adjustbox `max` keys only shrink — small and inline images are unaffected; only page-taller images are bounded. adjustbox is already this component's declared preamble.

### Issue 4 — Per-instance height override from markdown

A per-instance value overrides the relevant default macro for that one diagram/image. The value is a **fraction of `\textheight`** (no backslashes needed in markdown); `maxheight=0.5` → `0.5\textheight`.

- **Diagrams:** an info-string after the fence language — ` ```mermaid maxheight=0.5 ` (and the PlantUML equivalent). The pre-render fence regex gains an optional info-string capture group; the diagram content passed to `mmdc`/PlantUML is unchanged. The `diagramMap` type changes from today's `Map<string, string>` (fence text → pdf path) to `Map<string, { pdfPath: string; maxHeight?: string }>`, where `maxHeight` is the composed LaTeX height (e.g. `0.5\textheight`). The composer emits `height=<maxHeight>` when present, else `height=\druckDiagramMaxHeight` — always with `keepaspectratio`.
- **Images:** the title — `![alt](src "maxheight=0.5")`. `block:image` parses `element.title`; when it matches `maxheight=<number>`, emit `max totalheight=<number>\textheight` instead of `\druckImageMaxHeight`.
- **Parsing:** a single pure helper parses `maxheight=<number>` (accepting a positive decimal) and returns the `\textheight` expression, or nothing. Malformed/absent → fall back to the default macro. Shared by the fence-info path and the image-title path.

### Docs (skill + `docs/extending-druckform.md`)

- The Mermaid rich-label limitation (Issue 1): labels are plain text; bold/links/`<br>` are unsupported.
- `diagrams.mermaid.themeVariables` (inline) and `themeVariablesRef` (file) with a brand-colour example; note that `themeVariables` forces the `base` theme (Issue 2).
- The default height caps and the `\druckDiagramMaxHeight` / `\druckImageMaxHeight` override macros (Issue 3).
- The `maxheight=<fraction>` markdown syntax for diagrams (fence info-string) and images (title), value = fraction of text height (Issue 4).

## Testing

- **Issue 1 & 2 (`renderMermaid`):** mock `spawnSync` (`node:child_process`) to capture args and read the written config file. Assert: config always has `htmlLabels:false`; with `themeVariables` → config has `"theme":"base"` + the variables and args contain **no** `-t`; without → args contain `-t <theme>` and config has no `theme` key; `themeVariablesRef` is loaded from `styleDir` and inline `themeVariables` wins over a ref.
- **Issue 3 & 4 (composer):** extend `tests/unit/composer-diagram.test.ts` — engine-core defines both macros; a `diagramMap` entry with no `maxHeight` emits `height=\druckDiagramMaxHeight,keepaspectratio`; an entry with `maxHeight: "0.5\\textheight"` emits `height=0.5\textheight,keepaspectratio`. (Update the existing `width=\linewidth`-only assertion.)
- **Issue 3 & 4 (`block:image`):** unit-test via the `renderComponent` helper — no title → `max width=\linewidth, max totalheight=\druckImageMaxHeight`; title `"maxheight=0.5"` → `max totalheight=0.5\textheight`; a non-directive title → default cap, directive ignored.
- **Issue 4 (parse helper):** unit-test the `maxheight=` parser directly — valid decimal → `<n>\textheight`; missing/malformed → undefined.
- **Docs:** any new example component passes `druck doctor`.

## Affected files

- `src/diagram/mermaid.ts` — config file (htmlLabels + theme/themeVariables), `-c`/`-t` logic, `styleDir` param, ref resolution.
- `src/diagram/pre-render.ts` — pass `styleDir` to `renderMermaid`; fence regex info-string capture; `diagramMap` value shape; the shared `maxheight=` parse helper (or a small new module for it).
- `src/latex/composer.ts` — engine-core macros; consume the `diagramMap` `{ pdfPath, maxHeight }` value at the diagram include.
- `src/style/validate.ts`, `src/sdk/types.ts` — `themeVariables` schema/type.
- `templates/base/components/block-image.ts` — `max totalheight` default + title `maxheight=` directive.
- `src/diagram/types.ts` — home for the new `diagramMap` value type (the file currently holds only an unused `DiagramResult`; either wire it up or add the value type here) — plus the `Map<string, string>` → `Map<string, {...}>` change in `pre-render.ts` and `composer.ts` signatures.
- `claude-plugin/skills/druckform-authoring/SKILL.md`, `docs/extending-druckform.md` — the four doc items above.
- Tests: `tests/unit/composer-diagram.test.ts` (extend), new mermaid renderer test, `block:image` test, parse-helper test.
