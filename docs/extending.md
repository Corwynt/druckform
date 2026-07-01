# Extending Druckform

This guide explains how to add custom components, templates, and styles — either for local use or as contributions.

## Adding a TypeScript component

TypeScript components give you full programmatic control over LaTeX output.

### File location

When using the Docker image, mount custom templates to `/work/templates/`:

```
/work/templates/
└── my-template/
    ├── template.yaml
    └── components/
        └── my-component.ts
```

Inside the container, set `DRUCKFORM_TEMPLATES_DIR=/work/templates` (already the default).

### Component file structure

A TypeScript component file (`*.ts`) must export three named values:

```ts
import { z } from "zod";
import { Tex, raw } from "../../../src/sdk/tex.js";  // adjust path if outside the monorepo
import type { Component, RenderCtx } from "../../../src/sdk/types.js";

// 1. Zod schema for params (required)
export const schema = z.object({
  title: z.string(),
  variant: z.enum(["info", "warn", "danger"]).default("info"),
});

// 2. Metadata (required)
export const meta = {
  name: "my-component",
  description: "A short description shown in druck components --json.",
  acceptsChildren: true,
  example: ':::my-component{title="Hello"}\nBody text.\n:::',
  requiredTokens: ["accent"], // token names this component reads from ctx.token()
};

// 3. Render function (required)
export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const color = ctx.token("accent");
  return Tex`\begin{myenv}{${raw(color)}}{${params.title}}
${raw(children)}
\end{myenv}`;
};
```

**`Tex` tagged template:** escapes all interpolated values for LaTeX automatically (handles `& % _ # $ { } ~ ^ \`). Use `raw(...)` only when the value is already safe LaTeX (e.g. a colour macro name or pre-escaped children).

**`ctx.token(name)`** returns the LaTeX macro name for a style token, e.g. `ctx.token("accent")` → `\druckAccent`. The macro resolves to the hex colour at render time.

**`acceptsChildren: true`** enables the `:::` fence syntax to carry body content. The body is passed as `children: string` — already-compiled LaTeX from nested blocks.

### Params and types

Use Zod to define params. Supported Zod types and their druckform mappings:

| Zod type | CLI param type | Notes |
|----------|---------------|-------|
| `z.string()` | string | Any string value |
| `z.enum([...])` | string (validated) | Only the listed values are accepted |
| `.default(value)` | optional | Makes the param optional with a default |

Token params (e.g. `accent` above in the YAML form) are just `z.string()` — the value is a token name. Use `ctx.token(paramValue)` to resolve it.

### Registering the component in a template

Reference the component in your `template.yaml`:

```yaml
name: my-template
description: "My custom template."
extends: base          # optional — inherit all base components
components:
  my-component:
    source: components/my-component.ts
```

## Adding a YAML component

YAML components are declarative — no JavaScript. Use them for simple LaTeX wrappers with slots.

```yaml
name: badge
description: "Inline coloured badge."
params:
  label: { type: string, required: true }
  color: { type: token, required: false, default: accent }
slots:
  children: false      # no body content
emits: |
  \badge{{{color}}}{{{label}}}
example: |
  :::badge{label="NEW"}
  :::
```

**`params` types:**
- `type: string` — any string value; referenced as `{{{param-name}}}` in `emits` (triple braces = raw, double `{{name}}` = HTML-escaped — use triple for LaTeX)
- `type: token` — a style token name; `{{{token-name}}}` resolves to the LaTeX macro name at compile time

**`emits`:** a Mustache template. Use `{{{name}}}` (triple braces) for all substitutions — this produces raw LaTeX output without escaping.

## Template inheritance

Templates can extend a single parent template. Children inherit all parent components and can override or add their own.

```yaml
name: corporate
description: "Corporate document template."
extends: base

# Override the base infobox with different default colours:
components:
  infobox:
    extends: base.infobox
    defaults:
      accent: warning   # use the warning token instead of accent

  # Add a new component available only in this template:
  disclaimer:
    source: components/disclaimer.ts
```

The `extends` key at the component level must be `<parent-template-name>.<component-name>`. Only `defaults` overrides are supported this way (type-a override); to change the LaTeX output, provide a new `source`.

## Bundled vs user templates

Bundled templates (shipped in the Docker image) live at `/app/packages/druckform/templates/` and are read-only at runtime. User templates live at `DRUCKFORM_TEMPLATES_DIR` (default `/work/templates/`). Both directories are merged; user templates take precedence on name collision.

To add templates without rebuilding the image:

```bash
docker run --rm \
  -v "$(pwd)/my-templates:/work/templates" \
  ghcr.io/druckform/druckform:latest \
  templates --json
```

## Style schema reference

The style file is validated against `schemas/style-v1.json`. All fields:

```yaml
$schema: "style-v1"          # required string literal

tokens:                       # required
  colors:                     # optional map of name → #RRGGBB
    accent:    "#2E5AAC"
    warning:   "#B26A00"
  fonts:                      # optional
    main: "TeX Gyre Pagella"
    mono: "JetBrains Mono"
  spacing:                    # optional map of name → CSS length string
    blockGap: "0.8em"

diagrams:                     # optional
  mermaid:                    # optional
    theme: "neutral"          # mermaid theme name
    themeVariablesRef: "..."  # optional path to mermaid theme-variables JSON
  plantuml:                   # optional
    skinRef: "skin.puml"      # path relative to assets/
```

**Validation:** `tokens.colors` values must match `^#[0-9A-Fa-f]{6}$`. Other values are free strings. Additional properties are rejected (the schema uses `additionalProperties: false`).

## Required tokens

Components declare which style tokens they need via `requiredTokens` (TypeScript) or `type: token` params (YAML). The render engine statically validates that all required tokens are present in the style file before invoking LaTeX. A missing token is a lint error, not a runtime error.

## Contributing

1. Fork the repository and create a branch.
2. Add your component and a test fixture in `packages/druckform/tests/fixtures/`.
3. Run `pnpm turbo test` — all tests must pass, coverage gate: 80% line.
4. Run `pnpm lint` (Biome) — no lint errors.
5. Open a PR. Changesets manages releases; add a changeset with `pnpm changeset`.
