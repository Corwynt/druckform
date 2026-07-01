---
name: druckform-authoring
description: Use when creating or modifying a druckform component or template — adding a new component, writing a block override, authoring a document shell, or setting up a new template directory.
---

# Druckform Authoring

Author and validate custom components and templates for the druckform render pipeline. Two formats (TypeScript, declarative YAML), one loop.

## The Author Loop

```
scaffold → edit → doctor → preview → iterate
```

| CLI | MCP equivalent |
|-----|----------------|
| `druck new component --template <t> --name <n>` | `scaffold_component` |
| `druck doctor --template <t>` | `validate_component` |
| `druck preview-component -t <t> --name <n> --out /tmp/p.pdf` | `preview_component` |
| `list_components` | returns `source`, `acceptsElement`, `form`, `contractVersion` in addition to the consume fields |

`druck doctor` validates the full template (all components, extends chain) without a document or style file — run it before every preview. `preview-component` uses `meta.example` when `--params`/`--children` are omitted.

Add `--watch` to `preview-component` to re-render on every save while editing.

`preview-component`/`preview_component` previews any registered `inline`, `leaf`, or
`container` component — it synthesizes the directive in the component's own `form`
(from `meta.form`), so the preview exercises the real render path. The `document`
shell and `block:*` overrides are renderer-internal and cannot be previewed in
isolation — iterate on them with a full `render` against a small test document instead.

## Directive Components (inline / leaf / container)

Components are invoked via generic directives, one syntax with three forms by colon count:

| Form | Syntax | `meta.form` |
|---|---|---|
| inline | `:name[content]{attrs}` | `"inline"` — must emit inline LaTeX |
| leaf | `::name[content]{attrs}` | `"leaf"` — single line, no nested body |
| container | `:::name{attrs}` … `:::` | `"container"` (default) — can nest Markdown/components |

**Attributes** `{#id .class key=val}`: `#id` (last wins if repeated), `.class` (repeats combine), `key="value"`/`key=value` (bare value has no whitespace), bare `key` alone → `"true"`.

**Inline firing rule:** a `:` only starts an inline directive when followed by a letter-initial name and immediately by `[content]` and/or `{attrs}` (at least one required) — this is what keeps `10:30`/`localhost:8080` as plain text. Escape a would-be directive colon with `\:` (standard Markdown backslash-escaping — `:` is an escapable punctuation character, so the leading `:` never reaches the directive rule). An unregistered name in any form is an error, not a passthrough.

**`raw` escape hatch** — reserved name, all three forms, emits its body verbatim (unescaped): `:::raw{format=latex} ... :::`, `::raw[...]{format=latex}`, `:raw[...]{format=latex}`. Only `format=latex` is honored (emitted as-is); `format=html` is reserved for a future Obsidian renderer and is skipped by druckform. Use it when you need LaTeX the component model can't express.

**Portability:** the syntax follows the CommonMark generic-directives convention (micromark/remark-directive compatible) so the same document could later be opened by an Obsidian plugin — not part of druckform today.

## TypeScript Component Contract

A `.ts` component **must** export three names (four if it needs a preamble):

```ts
import { z, tokenRef } from "druckform";
import { Tex, raw, escapeTeX } from "druckform";
import type { Component, RenderCtx, BlockElement } from "druckform";

export const schema = z.object({
  title: z.string(),
  accent: tokenRef("accent"),   // preferred over meta.requiredTokens — derived automatically
});

export const meta = {
  name: "banner",               // must equal the filename stem for auto-discovery
  description: "Full-width banner.",
  acceptsChildren: true,
  example: ':::banner{title="Launch"}\nBody\n:::',
  // requiredTokens: ["accent"],  // legacy — still honored; unioned with tokenRef-derived set
};

export const preamble = `\\usepackage{tcolorbox}`;   // injected once, deduplicated
// `z` is re-exported from "druckform" (same zod instance) so you can import
// schema + druckform helpers from one place; `import { z } from "zod";` also
// works if you prefer importing zod directly.

export const render: Component<typeof schema> = (params, children, ctx, element?) => {
  return Tex`\begin{tcolorbox}[title=${params.title}]
${raw(children)}
\end{tcolorbox}`;
};
```

**Escaping rules — read before splicing LaTeX:**

| Expression | When to use |
|---|---|
| `escapeTeX(s)` | raw user string (any `params.*` not going through `Tex`) |
| `` Tex`…${x}…` `` | tagged template — auto-escapes interpolations |
| `raw(x)` | wrap trusted content inside `Tex`: `children`, `ctx.token("name")`, prebuilt LaTeX |

Never put a `params.*` string into LaTeX without `escapeTeX` or `Tex` (without `raw`).

**Tokens: color name vs. switch macro.** A color token `accent` compiles to *both* a
color **named** `druckAccent` (bare name, no backslash — use in color-key args like
`colframe=druckAccent`, `\rowcolor{druckAccent}`, `druckAccent!30`) and a switch
**macro** `\druckAccent` (use in running text). `ctx.token("accent")` returns the
**macro** — splicing it into a `colframe=`/`\rowcolor{}` argument breaks; those need
the bare name (`druck<Name>`, capitalize-first) instead.

## Declarative Component Contract (`*.component.yaml`)

```yaml
name: infobox
description: "Boxed note with optional body."
params:
  title:  { type: string, required: true }
  accent: { type: token,  required: false, default: accent }  # auto-adds to requiredTokens
slots:
  children: true
preamble: |
  \newenvironment{infobox}[2]{...}{...}
emits: |
  \begin{infobox}{{{accent}}}{{{title}}}
  {{children}}
  \end{infobox}
example: |
  :::infobox{title="Note"}
  Body text.
  :::
```

Interpolation: `string` params → `escapeTeX`-escaped; `token` params → `ctx.token(...)` macro (raw); `{{children}}` → pre-rendered child LaTeX (raw).

## Template-Bundled Assets (`ctx.asset`, `ctx.templateDir`)

- `ctx.asset(ref)` — resolves `ref` against the defining template's dir, returns an
  **absolute** path (use directly in `\includegraphics`), auto-converts `.svg` → PDF.
  Requires `rsvg-convert` for SVG (hard error if missing — `brew install librsvg`).
  Memoized per render; throws if the file doesn't exist.
- `ctx.templateDir` — the raw absolute template root (for `\input`, a bundled `.sty`, fontspec `Path=...`).

```ts
return raw(`\\includegraphics[height=8mm]{${ctx.asset("logo.svg")}}`);
```

## The 4th Render Arg (`element?`)

Only populated for:
- **`block:*` components** — receives a typed `BlockElement` (`kind: "heading" | "table" | "list" | "codeblock" | "blockquote" | "image" | "hr"`).
- **`document` shell** — receives `DocumentLayout` (`kind: "document"`, `documentclass`, `stylePreamble`, `componentPreamble`, `frontmatter`). The body marker is **not** a payload field — a TS shell emits the literal string `DRUCKFORM_BODY`; a declarative (YAML) shell writes `{{body}}` in its `emits:`.

**RenderCtx fields:** `ctx.token(name)` returns the LaTeX macro (e.g. `\druckAccent`); `ctx.style` exposes raw token values as `{ colors: Record<string,string>, fonts: { main?, mono? }, spacing: Record<string,string> }` — use it when you need a raw value (e.g. `ctx.style.fonts.main`), as opposed to `ctx.token(name)` which returns the macro.
  Frontmatter is available both on the payload (`element.frontmatter`) and mirrored on `ctx.frontmatter` — same `Record<string,string>`, use either. Typical title block:
  ```ts
  const fm = (el as DocumentLayout).frontmatter;
  const title = escapeTeX(fm.title ?? "");
  ```
  See `docs/extending-druckform.md` §3.4 for the full worked example.

Guard on `kind` and fall back gracefully for `:::` components (element is undefined).

## Reserved Names

| Name | Rule |
|---|---|
| `block:heading`, `block:list`, `block:table`, `block:blockquote`, `block:codeblock`, `block:image`, `block:hr` | Can be overridden; cannot be tombstoned; no new `block:*` names allowed |
| `document` | Reserved shell; override to control page layout |

**`document` shell rules:**
- Must emit the string `DRUCKFORM_BODY` exactly where the rendered body goes.
- Must NOT emit `\documentclass` or the engine-core packages (`fontspec`, `xcolor`, `graphicx`, `hyperref`, `ulem`) — the composer injects them before your shell.
- Emit `el.stylePreamble` and `el.componentPreamble` from the payload.
- A shell missing the body marker is rejected at compose time.
- The composer also injects `\druckDiagramMaxHeight` / `\druckImageMaxHeight`
  (both default `0.82\textheight`) — `\renewcommand` either to retune the default
  cap for diagrams/images; a single graphic can override its own cap from
  Markdown with `maxheight=<n>` (fence info-string for diagrams, image title for
  `block:image`). See `docs/extending-druckform.md` §3.3.

## Mermaid Diagrams

- Labels render as SVG `<text>` (druckform sets `htmlLabels:false`) — librsvg can't
  render the `<foreignObject>` HTML Mermaid emits by default. **Rich HTML in
  labels (bold, links, `<br>`) is not supported**; use plain text.
- Brand colours: `diagrams.mermaid.themeVariables` (inline) or
  `diagrams.mermaid.themeVariablesRef` (JSON file beside the style). Either one
  forces Mermaid's `base` theme; `theme` alone picks a named theme.

## Auto-Discovery & Registration

Drop a file in a template's `components/` directory — no `template.yaml` edit needed:
- `banner.ts` → registered as `banner` (stem must equal `meta.name`; doctor flags mismatch).
- `banner.component.yaml` → registered under its `name:` field.
- `block:*` names are **never** auto-discovered; register them explicitly in `template.yaml`.

Explicit `template.yaml` entries win over auto-discovered files (use for `defaults:`, partial `extends:`, or tombstones).

User templates live in `$DRUCKFORM_TEMPLATES_DIR/<name>/template.yaml`. Scaffold with `druck new template --name acme --extends base`.

## Quick Reference: Template Override Mechanisms

| Goal | `template.yaml` entry |
|---|---|
| New component | `source: components/banner.ts` |
| Change only defaults | `extends: base.infobox` + `defaults: { accent: warning }` |
| Remove inherited component | `infobox: null` (tombstone; forbidden for `block:*`) |
| Override block renderer | `"block:table": { source: components/block-table.ts }` |

## Common Mistakes

| Symptom | Fix |
|---|---|
| `Missing required style token 'X'` | Add token to style; note `fonts.main` → required name `fontMain`, not `main` |
| `reserved 'block:' namespace … unknown component` | Remove `block:` prefix from your custom component name |
| `Component X extends unknown parent` | Check `extends: base.X` target exists in parent template |
| garbled special chars in PDF | Wrap `params.*` in `escapeTeX(...)` or use `Tex` without `raw` |
| preview renders nothing | Omitted `meta.example` and no `--params`/`--children` — add `example` to `meta` |
| doctor reports filename/name mismatch | Rename `.ts` file so stem equals `meta.name` |

## References

- Full contract and worked example: `docs/extending-druckform.md` (§5 component authoring, §6 templates, §7 block elements)
- Canonical copy-paste starting points: `docs/examples-gallery.md`
