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
| `list_components` | returns `source`, `acceptsElement`, `contractVersion` in addition to the consume fields |

`druck doctor` validates the full template (all components, extends chain) without a document or style file — run it before every preview. `preview-component` uses `meta.example` when `--params`/`--children` are omitted.

Add `--watch` to `preview-component` to re-render on every save while editing.

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
  example: '::: banner title="Launch"\nBody\n:::',
  // requiredTokens: ["accent"],  // legacy — still honored; unioned with tokenRef-derived set
};

export const preamble = `\\usepackage{tcolorbox}`;   // injected once, deduplicated

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
  ::: infobox title="Note"
  Body text.
  :::
```

Interpolation: `string` params → `escapeTeX`-escaped; `token` params → `ctx.token(...)` macro (raw); `{{children}}` → pre-rendered child LaTeX (raw).

## The 4th Render Arg (`element?`)

Only populated for:
- **`block:*` components** — receives a typed `BlockElement` (`kind: "heading" | "table" | "list" | "codeblock" | "blockquote" | "image" | "hr"`).
- **`document` shell** — receives `DocumentLayout` (`kind: "document"`, `documentclass`, `stylePreamble`, `componentPreamble`, `frontmatter`). The body marker is **not** a payload field — a TS shell emits the literal string `DRUCKFORM_BODY`; a declarative (YAML) shell writes `{{body}}` in its `emits:`.

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
