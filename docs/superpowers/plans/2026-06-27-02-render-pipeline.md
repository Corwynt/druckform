# Phase 2: Render Pipeline (`druckform` package)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully working `druck templates / components / lint / render` CLI with bundled `base` and `report` templates, validated against golden fixtures, no MCP or Docker needed.

**Architecture:** Eight focused modules built bottom-up: SDK primitives → style system → component loader → template resolver → document parser → diagram stubs → LaTeX composer → CLI subcommands. Each layer is independently testable.

**Tech Stack:** TypeScript, yargs, zod, zod-to-json-schema, js-yaml, ajv, esbuild (for user .ts components), Vitest.

## Global Constraints

- Zero network surface in this package — no sockets, no HTTP
- All user-supplied text escaped via `Tex` builder before entering LaTeX
- `token`-typed params resolve to style macros only — never raw hex
- Asset refs rejected if they escape the assets root (`../`, absolute paths)
- `--json` flag: emit ONLY the contract JSON to stdout, nothing else
- All contract shapes include `"schemaVersion": "1"`
- Children rendered before parent in component tree
- Tectonic always invoked with `--keep-logs --untrusted-input` (no shell-escape)
- Coverage exclusions: `src/diagram/**`, `src/latex/tectonic.ts`

## File Map

```
packages/druckform/
├── src/
│   ├── sdk/
│   │   ├── types.ts          # all shared interfaces and contract shapes
│   │   ├── tex.ts            # Tex tagged template + escapeTeX
│   │   └── asset-path.ts     # resolveAssetPath — path confinement
│   ├── style/
│   │   ├── validate.ts       # validate style.yaml against style-v1.json
│   │   ├── compiler.ts       # StyleTokens → LaTeX preamble string
│   │   └── tokens.ts         # extract required token names from resolved template
│   ├── component/
│   │   ├── declarative.ts    # load .component.yaml → ComponentDef
│   │   ├── typescript.ts     # load .ts via esbuild → ComponentDef
│   │   └── loader.ts         # dispatch by file extension
│   ├── template/
│   │   ├── loader.ts         # read template.yaml from disk
│   │   └── resolver.ts       # linearize inheritance, merge defaults → ResolvedTemplate
│   ├── parse/
│   │   ├── types.ts          # ASTNode, ComponentBlock, ParsedDocument
│   │   └── parser.ts         # Markdown + ::: blocks → ParsedDocument
│   ├── diagram/
│   │   ├── types.ts          # DiagramRenderer interface
│   │   ├── mermaid.ts        # mmdc subprocess → SVG → PDF
│   │   └── plantuml.ts       # plantuml jar → SVG/PDF
│   ├── latex/
│   │   ├── md-to-latex.ts    # minimal Markdown → LaTeX (paragraphs, bold, headings, lists)
│   │   ├── composer.ts       # AST → .tex + SourceMap
│   │   ├── tectonic.ts       # run tectonic, capture stdout/stderr
│   │   └── error-mapper.ts   # tectonic log lines → Finding[]
│   ├── commands/
│   │   ├── templates.ts      # druck templates [--json]
│   │   ├── components.ts     # druck components --template X [--json]
│   │   ├── lint.ts           # druck lint --template X --in X [--json]
│   │   └── render.ts         # druck render ... [--json]
│   ├── index.ts              # public SDK exports
│   └── cli.ts                # yargs entrypoint wiring all subcommands
├── schemas/
│   └── style-v1.json         # published JSON Schema for style.yaml
├── templates/
│   ├── base/
│   │   ├── template.yaml
│   │   └── components/
│   │       └── infobox.component.yaml
│   └── report/
│       ├── template.yaml
│       └── components/
│           └── callout.ts
├── styles/
│   └── example/
│       ├── style.yaml
│       ├── mermaid-vars.json
│       └── skin.puml
└── tests/
    ├── unit/
    │   ├── tex.test.ts
    │   ├── asset-path.test.ts
    │   ├── style-compiler.test.ts
    │   ├── style-tokens.test.ts
    │   ├── template-resolver.test.ts
    │   ├── component-declarative.test.ts
    │   ├── parser.test.ts
    │   └── error-mapper.test.ts
    ├── integration/
    │   ├── lint.test.ts
    │   └── render.test.ts
    └── fixtures/
        ├── templates/         (copies of bundled templates for test isolation)
        ├── styles/
        ├── documents/
        └── golden/
```

---

### Task 1: SDK types + Tex builder + asset-path

**Files:**
- Create: `packages/druckform/src/sdk/types.ts`
- Create: `packages/druckform/src/sdk/tex.ts`
- Create: `packages/druckform/src/sdk/asset-path.ts`
- Create: `packages/druckform/tests/unit/tex.test.ts`
- Create: `packages/druckform/tests/unit/asset-path.test.ts`

**Interfaces:**
- Produces: `ComponentDef`, `ResolvedTemplate`, `ParsedDocument`, `Finding`, `RenderCtx`, `Tex`, `escapeTeX`, `resolveAssetPath`, all contract shapes — used by every subsequent task

- [ ] **Step 1: Write `src/sdk/types.ts`**

```ts
import type { ZodObject, ZodRawShape, infer as ZInfer } from "zod";

// ── Findings & contract shapes ──────────────────────────────────────────────

export interface Finding {
  severity: "error" | "warning";
  component: string;
  message: string;
  line?: number;
}

export interface TemplatesContract {
  schemaVersion: "1";
  templates: Array<{
    name: string;
    extends: string | null;
    origin: "bundled" | "user";
    description?: string;
  }>;
}

export interface ComponentsContract {
  schemaVersion: "1";
  template: string;
  components: Array<{
    name: string;
    description: string;
    params: Record<string, unknown>; // JSON Schema
    acceptsChildren: boolean;
    example?: string;
  }>;
}

export interface LintContract {
  schemaVersion: "1";
  ok: boolean;
  findings: Finding[];
}

export interface RenderContract {
  schemaVersion: "1";
  status: "ok" | "error";
  pdf: string | null;
  error?: { summary: string; findings: Finding[] };
}

// ── Style ───────────────────────────────────────────────────────────────────

export interface StyleTokens {
  colors: Record<string, string>;     // name → #hex
  fonts: { main?: string; mono?: string };
  spacing: Record<string, string>;    // name → css-length
}

export interface StyleConfig {
  $schema: string;
  tokens: {
    colors?: Record<string, string>;
    fonts?: { main?: string; mono?: string };
    spacing?: Record<string, string>;
  };
  diagrams?: {
    mermaid?: { theme?: string; themeVariablesRef?: string };
    plantuml?: { skinRef?: string };
  };
}

// ── Render context ──────────────────────────────────────────────────────────

export interface RenderCtx {
  /** Returns the LaTeX macro name for a style token, e.g. \accentcolor */
  token(name: string): string;
  style: StyleTokens;
}

// ── Components ──────────────────────────────────────────────────────────────

export type Component<TSchema extends ZodObject<ZodRawShape>> = (
  params: ZInfer<TSchema>,
  children: string,
  ctx: RenderCtx,
) => string;

export interface ComponentMeta {
  name: string;
  description: string;
  acceptsChildren: boolean;
  example?: string;
  /** Token names this component reads from ctx.token() — for static validation */
  requiredTokens?: string[];
}

export interface ComponentDef {
  meta: ComponentMeta;
  schema: ZodObject<ZodRawShape>;
  /** JSON Schema derived from zod schema, for contract output */
  jsonSchema: Record<string, unknown>;
  render: (params: unknown, children: string, ctx: RenderCtx) => string;
  /** All token names this component requires (from params + meta.requiredTokens) */
  requiredTokens: Set<string>;
}

// ── Templates ───────────────────────────────────────────────────────────────

export interface ComponentOverrideSpec {
  source?: string;       // path to .ts or .component.yaml (relative to template dir)
  extends?: string;      // "parentTemplate.componentName" — type-a partial override only
  defaults?: Record<string, string>;
}

export interface TemplateConfig {
  name: string;
  description?: string;
  extends?: string;
  style_defaults?: string;
  components: Record<string, ComponentOverrideSpec>;
}

export interface ResolvedComponentEntry {
  def: ComponentDef;
  defaults: Record<string, string>; // merged param defaults from inheritance chain
}

export interface ResolvedTemplate {
  name: string;
  description?: string;
  origin: "bundled" | "user";
  extendsChain: string[];
  style_defaults?: string;
  components: Record<string, ResolvedComponentEntry>;
}

// ── AST ─────────────────────────────────────────────────────────────────────

export interface ComponentBlock {
  name: string;
  params: Record<string, string>;
  children: ASTNode[];
  sourceLine: number;
}

export type ASTNode =
  | { type: "text"; content: string; sourceLine: number }
  | { type: "component"; block: ComponentBlock };

export interface ParsedDocument {
  nodes: ASTNode[];
}

// ── LaTeX source map ─────────────────────────────────────────────────────────

export interface SourceMapEntry {
  componentName: string;
  sourceLine: number; // line in source .md
}

export type SourceMap = Map<number, SourceMapEntry>; // .tex line number → source
```

- [ ] **Step 2: Write `src/sdk/tex.ts`**

```ts
const SPECIAL_RE = /[&%_#${}~^\\]/g;

const ESCAPE_MAP: Record<string, string> = {
  "&": "\\&",
  "%": "\\%",
  _: "\\_",
  "#": "\\#",
  $: "\\$",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "\\": "\\textbackslash{}",
};

export function escapeTeX(text: string): string {
  return text.replace(SPECIAL_RE, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/** Raw LaTeX — inserted without escaping. Use only for trusted values (tokens, rendered children). */
export class RawTeX {
  constructor(public readonly value: string) {}
}

export const raw = (value: string) => new RawTeX(value);

/**
 * Tagged template literal that auto-escapes string interpolations.
 * Wrap a value in raw() to skip escaping (for tokens and rendered children).
 *
 * @example
 * Tex`\textbf{${userTitle}}`          // userTitle is escaped
 * Tex`\color{${raw(tokenMacro)}}{}`   // tokenMacro inserted as-is
 */
export function Tex(
  strings: TemplateStringsArray,
  ...values: Array<string | RawTeX>
): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      out += v instanceof RawTeX ? v.value : escapeTeX(String(v));
    }
  }
  return out;
}
```

- [ ] **Step 3: Write failing tests `tests/unit/tex.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Tex, escapeTeX, raw } from "../../src/sdk/tex.js";

describe("escapeTeX", () => {
  it("escapes all 10 TeX special characters", () => {
    expect(escapeTeX("& % _ # $ { } ~ ^ \\")).toBe(
      "\\& \\% \\_ \\# \\$ \\{ \\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}"
    );
  });

  it("leaves safe text unchanged", () => {
    expect(escapeTeX("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeTeX("")).toBe("");
  });
});

describe("Tex", () => {
  it("escapes interpolated strings", () => {
    const title = "Report & Summary";
    expect(Tex`\textbf{${title}}`).toBe("\\textbf{Report \\& Summary}");
  });

  it("inserts raw() values without escaping", () => {
    const macro = "\\accentcolor";
    expect(Tex`\color{${raw(macro)}}{text}`).toBe("\\color{\\accentcolor}{text}");
  });

  it("handles mixed escaped and raw values", () => {
    const user = "100%";
    const token = "\\warningColor";
    expect(Tex`${user} ${raw(token)}`).toBe("100\\% \\warningColor");
  });
});
```

- [ ] **Step 4: Run tex tests — verify they fail**

```bash
cd packages/druckform && pnpm vitest run tests/unit/tex.test.ts
```

Expected: FAIL — modules not found yet.

- [ ] **Step 5: Write `src/sdk/asset-path.ts`**

```ts
import path from "node:path";

/**
 * Resolves `assetRef` against `assetsRoot` and throws if the resolved path
 * would escape the root (path traversal / absolute path injection).
 *
 * Returns the absolute resolved path when safe.
 */
export function resolveAssetPath(assetsRoot: string, assetRef: string): string {
  if (path.isAbsolute(assetRef)) {
    throw new Error(`Asset ref must be relative, got: ${assetRef}`);
  }
  const resolved = path.resolve(assetsRoot, assetRef);
  const root = path.resolve(assetsRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Asset ref escapes assets root: ${assetRef}`);
  }
  return resolved;
}
```

- [ ] **Step 6: Write failing tests `tests/unit/asset-path.test.ts`**

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAssetPath } from "../../src/sdk/asset-path.js";

const ROOT = "/work/assets";

describe("resolveAssetPath", () => {
  it("returns resolved path for a normal ref", () => {
    expect(resolveAssetPath(ROOT, "images/photo.png")).toBe(
      path.resolve(ROOT, "images/photo.png")
    );
  });

  it("throws on path traversal with ../", () => {
    expect(() => resolveAssetPath(ROOT, "../secret.txt")).toThrow("escapes");
  });

  it("throws on double ../ traversal", () => {
    expect(() => resolveAssetPath(ROOT, "images/../../etc/passwd")).toThrow("escapes");
  });

  it("throws on absolute path ref", () => {
    expect(() => resolveAssetPath(ROOT, "/etc/passwd")).toThrow("must be relative");
  });

  it("allows nested paths that stay inside root", () => {
    expect(resolveAssetPath(ROOT, "a/b/c/file.svg")).toBe(
      path.resolve(ROOT, "a/b/c/file.svg")
    );
  });
});
```

- [ ] **Step 7: Run all unit tests — verify they pass**

```bash
cd packages/druckform && pnpm vitest run tests/unit/tex.test.ts tests/unit/asset-path.test.ts
```

Expected: PASS — 8 tests pass.

- [ ] **Step 8: Update `src/index.ts` with real exports**

```ts
export { escapeTeX, Tex, raw, RawTeX } from "./sdk/tex.js";
export { resolveAssetPath } from "./sdk/asset-path.js";
export type {
  Finding,
  RenderCtx,
  Component,
  ComponentDef,
  ComponentMeta,
  ResolvedTemplate,
  StyleConfig,
  StyleTokens,
  LintContract,
  RenderContract,
  TemplatesContract,
  ComponentsContract,
} from "./sdk/types.js";
```

- [ ] **Step 9: Commit**

```bash
git add packages/druckform/src/sdk/ packages/druckform/tests/unit/tex.test.ts \
  packages/druckform/tests/unit/asset-path.test.ts packages/druckform/src/index.ts
git commit -m "feat(druckform): SDK types, Tex builder, asset-path confinement"
```

---

### Task 2: Style system

**Files:**
- Create: `packages/druckform/schemas/style-v1.json`
- Create: `packages/druckform/src/style/validate.ts`
- Create: `packages/druckform/src/style/compiler.ts`
- Create: `packages/druckform/src/style/tokens.ts`
- Create: `packages/druckform/tests/unit/style-compiler.test.ts`
- Create: `packages/druckform/tests/unit/style-tokens.test.ts`

**Interfaces:**
- Consumes: `StyleConfig`, `StyleTokens`, `ResolvedTemplate` from `sdk/types.ts`
- Produces: `validateStyle(path) → StyleConfig`, `compileStyle(config) → string` (LaTeX preamble), `extractRequiredTokens(template) → Set<string>`, `checkTokenCoverage(required, config) → Finding[]`

- [ ] **Step 1: Create `schemas/style-v1.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "style-v1",
  "title": "Druckform Style v1",
  "type": "object",
  "required": ["tokens"],
  "properties": {
    "$schema": { "type": "string" },
    "tokens": {
      "type": "object",
      "properties": {
        "colors": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "pattern": "^#[0-9A-Fa-f]{6}$"
          }
        },
        "fonts": {
          "type": "object",
          "properties": {
            "main": { "type": "string" },
            "mono": { "type": "string" }
          },
          "additionalProperties": false
        },
        "spacing": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        }
      },
      "additionalProperties": false
    },
    "diagrams": {
      "type": "object",
      "properties": {
        "mermaid": {
          "type": "object",
          "properties": {
            "theme": { "type": "string" },
            "themeVariablesRef": { "type": "string" }
          },
          "additionalProperties": false
        },
        "plantuml": {
          "type": "object",
          "properties": { "skinRef": { "type": "string" } },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 2: Write `src/style/validate.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import yaml from "js-yaml";
import type { StyleConfig } from "../sdk/types.js";

const schemaPath = new URL("../../schemas/style-v1.json", import.meta.url);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as object;
const ajv = new Ajv();
const validate = ajv.compile(schema);

export function loadStyle(stylePath: string): StyleConfig {
  const raw = fs.readFileSync(stylePath, "utf8");
  const data = yaml.load(raw);
  if (!validate(data)) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Invalid style.yaml: ${errors}`);
  }
  return data as StyleConfig;
}
```

- [ ] **Step 3: Write `src/style/compiler.ts`**

```ts
import type { StyleConfig, StyleTokens } from "../sdk/types.js";

export function extractTokens(config: StyleConfig): StyleTokens {
  return {
    colors: config.tokens.colors ?? {},
    fonts: config.tokens.fonts ?? {},
    spacing: config.tokens.spacing ?? {},
  };
}

/**
 * Converts style tokens to a LaTeX preamble fragment.
 * Components reference tokens via \druckNAME macros.
 */
export function compileStyle(config: StyleConfig): string {
  const tokens = extractTokens(config);
  const lines: string[] = ["% === Druckform style preamble ==="];

  // Colors: \definecolor{druckAccent}{HTML}{2E5AAC}
  for (const [name, hex] of Object.entries(tokens.colors)) {
    const macroName = `druck${capitalize(name)}`;
    const hexVal = hex.replace("#", "");
    lines.push(`\\definecolor{${macroName}}{HTML}{${hexVal}}`);
    // Also define a convenience alias macro \druckAccentColor
    lines.push(`\\newcommand{\\${macroName}}{\\color{${macroName}}}`);
  }

  // Fonts (requires fontspec package in document preamble)
  if (tokens.fonts.main) {
    lines.push(`\\setmainfont{${tokens.fonts.main}}`);
  }
  if (tokens.fonts.mono) {
    lines.push(`\\setmonofont{${tokens.fonts.mono}}`);
  }

  // Spacing: \newlength{\druckBlockgap}\setlength{\druckBlockgap}{0.8em}
  for (const [name, value] of Object.entries(tokens.spacing)) {
    const macroName = `druck${capitalize(name)}`;
    lines.push(`\\newlength{\\${macroName}}`);
    lines.push(`\\setlength{\\${macroName}}{${value}}`);
  }

  return lines.join("\n");
}

/** Returns the LaTeX macro name for a token, e.g. "accent" → "\\druckAccent" */
export function tokenMacro(name: string): string {
  return `\\druck${capitalize(name)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Write `src/style/tokens.ts`**

```ts
import type { ResolvedTemplate } from "../sdk/types.js";
import type { StyleConfig } from "../sdk/types.js";
import type { Finding } from "../sdk/types.js";

/**
 * Collects all token names required by the resolved template's components.
 * Token params in declarative components + meta.requiredTokens in TS components.
 */
export function extractRequiredTokens(template: ResolvedTemplate): Set<string> {
  const required = new Set<string>();
  for (const { def } of Object.values(template.components)) {
    for (const token of def.requiredTokens) {
      required.add(token);
    }
  }
  return required;
}

/**
 * Verifies that the style config provides all tokens required by the template.
 * Returns findings (errors) for each missing token.
 */
export function checkTokenCoverage(
  required: Set<string>,
  template: ResolvedTemplate,
  config: StyleConfig,
): Finding[] {
  const available = new Set([
    ...Object.keys(config.tokens.colors ?? {}),
    ...Object.keys(config.tokens.spacing ?? {}),
    ...(config.tokens.fonts?.main ? ["fontMain"] : []),
    ...(config.tokens.fonts?.mono ? ["fontMono"] : []),
  ]);

  const findings: Finding[] = [];
  for (const token of required) {
    if (!available.has(token)) {
      // Find which component needs this token
      const needingComponent = Object.entries(template.components).find(([, entry]) =>
        entry.def.requiredTokens.has(token),
      )?.[0] ?? "unknown";

      findings.push({
        severity: "error",
        component: needingComponent,
        message: `Missing required style token '${token}' (needed by component '${needingComponent}')`,
      });
    }
  }
  return findings;
}
```

- [ ] **Step 5: Write failing tests `tests/unit/style-compiler.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { compileStyle, tokenMacro } from "../../src/style/compiler.js";
import type { StyleConfig } from "../../src/sdk/types.js";

const minimalConfig: StyleConfig = {
  $schema: "style-v1",
  tokens: {
    colors: { accent: "#2E5AAC", warning: "#B26A00" },
    fonts: { main: "TeX Gyre Pagella", mono: "JetBrains Mono" },
    spacing: { blockGap: "0.8em" },
  },
};

describe("compileStyle", () => {
  it("emits \\definecolor for each color token", () => {
    const preamble = compileStyle(minimalConfig);
    expect(preamble).toContain("\\definecolor{druckAccent}{HTML}{2E5AAC}");
    expect(preamble).toContain("\\definecolor{druckWarning}{HTML}{B26A00}");
  });

  it("emits \\setmainfont and \\setmonofont", () => {
    const preamble = compileStyle(minimalConfig);
    expect(preamble).toContain("\\setmainfont{TeX Gyre Pagella}");
    expect(preamble).toContain("\\setmonofont{JetBrains Mono}");
  });

  it("emits \\newlength + \\setlength for spacing tokens", () => {
    const preamble = compileStyle(minimalConfig);
    expect(preamble).toContain("\\newlength{\\druckBlockGap}");
    expect(preamble).toContain("\\setlength{\\druckBlockGap}{0.8em}");
  });

  it("handles empty tokens gracefully", () => {
    const config: StyleConfig = { $schema: "style-v1", tokens: {} };
    expect(() => compileStyle(config)).not.toThrow();
  });
});

describe("tokenMacro", () => {
  it("returns the LaTeX macro name for a token", () => {
    expect(tokenMacro("accent")).toBe("\\druckAccent");
    expect(tokenMacro("blockGap")).toBe("\\druckBlockGap");
  });
});
```

- [ ] **Step 6: Run and fix until style tests pass**

```bash
cd packages/druckform && pnpm vitest run tests/unit/style-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/druckform/schemas/ packages/druckform/src/style/ \
  packages/druckform/tests/unit/style-compiler.test.ts \
  packages/druckform/tests/unit/style-tokens.test.ts
git commit -m "feat(druckform): style system — schema, compiler, token coverage check"
```

---

### Task 3: Component system

**Files:**
- Create: `packages/druckform/src/component/declarative.ts`
- Create: `packages/druckform/src/component/typescript.ts`
- Create: `packages/druckform/src/component/loader.ts`
- Create: `packages/druckform/tests/unit/component-declarative.test.ts`

**Interfaces:**
- Consumes: `ComponentDef`, `RenderCtx`, `Tex`, `raw`, `escapeTeX` from sdk
- Produces: `loadComponent(sourcePath, templateDir) → Promise<ComponentDef>`

- [ ] **Step 1: Write `src/component/declarative.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Tex, raw, escapeTeX } from "../sdk/tex.js";
import type { ComponentDef, RenderCtx } from "../sdk/types.js";

interface ParamSpec {
  type: "string" | "token";
  required?: boolean;
  default?: string;
}

interface DeclarativeComponentYaml {
  name: string;
  description: string;
  params: Record<string, ParamSpec>;
  slots?: { children?: boolean };
  emits: string;
  example?: string;
}

export function loadDeclarativeComponent(yamlPath: string): ComponentDef {
  const raw_yaml = fs.readFileSync(yamlPath, "utf8");
  const spec = yaml.load(raw_yaml) as DeclarativeComponentYaml;

  // Build Zod schema from param specs
  const shape: Record<string, z.ZodTypeAny> = {};
  const requiredTokens = new Set<string>();

  for (const [name, param] of Object.entries(spec.params)) {
    if (param.type === "token") {
      // Token params: default is the token name
      const defaultToken = param.default ?? name;
      requiredTokens.add(defaultToken);
      const field = z.string().default(defaultToken);
      shape[name] = field;
    } else {
      // String params
      let field: z.ZodTypeAny = z.string();
      if (!param.required) {
        field = param.default !== undefined ? field.default(param.default) : field.optional();
      }
      shape[name] = field;
    }
  }

  const schema = z.object(shape);
  const jsonSchema = zodToJsonSchema(schema, { name: spec.name }).definitions?.[spec.name]
    ?? zodToJsonSchema(schema);
  const acceptsChildren = spec.slots?.children === true;

  // Compile the emits template into a render function
  // Slots: {{paramName}} for escaped text, {{children}} for raw LaTeX
  const render = (params: unknown, children: string, ctx: RenderCtx): string => {
    const validated = schema.parse(params);
    let output = spec.emits;

    // Replace token slots with resolved macros
    for (const [name, param] of Object.entries(spec.params)) {
      if (param.type === "token") {
        const tokenName = (validated as Record<string, string>)[name] ?? param.default ?? name;
        output = output.replaceAll(`{{${name}}}`, ctx.token(tokenName));
      } else {
        const value = (validated as Record<string, string | undefined>)[name];
        if (value !== undefined) {
          output = output.replaceAll(`{{${name}}}`, escapeTeX(value));
        }
      }
    }

    // Replace children slot
    if (acceptsChildren) {
      output = output.replaceAll("{{children}}", children);
    }

    return output;
  };

  return {
    meta: {
      name: spec.name,
      description: spec.description,
      acceptsChildren,
      example: spec.example,
      requiredTokens: [...requiredTokens],
    },
    schema,
    jsonSchema: jsonSchema as Record<string, unknown>,
    render,
    requiredTokens,
  };
}
```

- [ ] **Step 2: Write `src/component/typescript.ts`**

```ts
import path from "node:path";
import esbuild from "esbuild";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ComponentDef, ComponentMeta } from "../sdk/types.js";
import { z } from "zod";

export async function loadTypeScriptComponent(tsPath: string): Promise<ComponentDef> {
  // Bundle the TS component to a temp ESM file in memory
  const result = await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    packages: "external", // don't bundle node_modules
    target: "node22",
  });

  const code = result.outputFiles[0]?.text;
  if (!code) throw new Error(`esbuild produced no output for ${tsPath}`);

  // Write to a temp file and import (data URL import not reliable for all deps)
  const tmpFile = path.join(
    path.dirname(tsPath),
    `.druckform-tmp-${Date.now()}.mjs`,
  );
  const fs = await import("node:fs/promises");
  await fs.writeFile(tmpFile, code, "utf8");

  try {
    const mod = await import(tmpFile) as {
      schema: z.ZodObject<z.ZodRawShape>;
      meta: ComponentMeta;
      render: (params: unknown, children: string, ctx: unknown) => string;
    };

    if (!mod.schema || !mod.meta || !mod.render) {
      throw new Error(`Component ${tsPath} must export schema, meta, and render`);
    }

    const jsonSchema = zodToJsonSchema(mod.schema, { name: mod.meta.name })
      .definitions?.[mod.meta.name] ?? zodToJsonSchema(mod.schema);

    const requiredTokens = new Set(mod.meta.requiredTokens ?? []);

    return {
      meta: mod.meta,
      schema: mod.schema,
      jsonSchema: jsonSchema as Record<string, unknown>,
      render: (params, children, ctx) => {
        const validated = mod.schema.parse(params);
        return mod.render(validated, children, ctx);
      },
      requiredTokens,
    };
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}
```

- [ ] **Step 3: Write `src/component/loader.ts`**

```ts
import path from "node:path";
import { loadDeclarativeComponent } from "./declarative.js";
import { loadTypeScriptComponent } from "./typescript.js";
import type { ComponentDef } from "../sdk/types.js";

export async function loadComponent(
  sourcePath: string,
  _templateDir: string,
): Promise<ComponentDef> {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    return loadDeclarativeComponent(sourcePath);
  }
  if (ext === ".ts" || ext === ".js" || ext === ".mjs") {
    return loadTypeScriptComponent(sourcePath);
  }
  throw new Error(`Unknown component file extension: ${ext} (${sourcePath})`);
}
```

- [ ] **Step 4: Write `tests/unit/component-declarative.test.ts`**

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDeclarativeComponent } from "../../src/component/declarative.js";
import type { RenderCtx } from "../../src/sdk/types.js";

// We test against a fixture YAML — create it inline using a temp approach
import fs from "node:fs";
import os from "node:os";

function makeTempYaml(content: string): string {
  const tmp = path.join(os.tmpdir(), `test-comp-${Date.now()}.component.yaml`);
  fs.writeFileSync(tmp, content, "utf8");
  return tmp;
}

const ctx: RenderCtx = {
  token: (name) => `\\druck${name.charAt(0).toUpperCase() + name.slice(1)}`,
  style: { colors: {}, fonts: {}, spacing: {} },
};

describe("loadDeclarativeComponent", () => {
  it("loads a minimal string-param component", () => {
    const p = makeTempYaml(`
name: box
description: A simple box
params:
  title: { type: string, required: true }
emits: |
  \\begin{box}{{{title}}}
  \\end{box}
`);
    const def = loadDeclarativeComponent(p);
    expect(def.meta.name).toBe("box");
    expect(def.meta.acceptsChildren).toBe(false);
    const output = def.render({ title: "Hello & World" }, "", ctx);
    expect(output).toContain("Hello \\& World");
  });

  it("resolves token params to style macros", () => {
    const p = makeTempYaml(`
name: colorbox
description: Colored box
params:
  accent: { type: token, required: false, default: accentColor }
emits: "\\\\color{{{accent}}}{content}"
`);
    const def = loadDeclarativeComponent(p);
    expect(def.requiredTokens.has("accentColor")).toBe(true);
    const output = def.render({}, "", ctx);
    expect(output).toContain("\\druckAccentColor");
  });

  it("passes children through raw for acceptsChildren components", () => {
    const p = makeTempYaml(`
name: section
description: A section
params:
  title: { type: string, required: true }
slots:
  children: true
emits: |
  \\begin{section}{{{title}}}
  {{children}}
  \\end{section}
`);
    const def = loadDeclarativeComponent(p);
    expect(def.meta.acceptsChildren).toBe(true);
    const output = def.render({ title: "Test" }, "\\textbf{body}", ctx);
    expect(output).toContain("\\textbf{body}");
  });
});
```

- [ ] **Step 5: Run component tests**

```bash
cd packages/druckform && pnpm vitest run tests/unit/component-declarative.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/druckform/src/component/ \
  packages/druckform/tests/unit/component-declarative.test.ts
git commit -m "feat(druckform): component system — declarative YAML + TypeScript loader"
```

---

### Task 4: Template resolver

**Files:**
- Create: `packages/druckform/src/template/loader.ts`
- Create: `packages/druckform/src/template/resolver.ts`
- Create: `packages/druckform/tests/unit/template-resolver.test.ts`

**Interfaces:**
- Consumes: `TemplateConfig`, `ResolvedTemplate`, `ComponentDef`, `loadComponent`
- Produces: `loadAllTemplates(bundledDir, userDir?) → Map<string, TemplateConfig & {dir, origin}>`, `resolveTemplate(name, allTemplates, loadComponent) → Promise<ResolvedTemplate>`

- [ ] **Step 1: Write `src/template/loader.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { TemplateConfig } from "../sdk/types.js";

export interface TemplateEntry {
  config: TemplateConfig;
  dir: string;
  origin: "bundled" | "user";
}

export function loadAllTemplates(
  bundledDir: string,
  userDir?: string,
): Map<string, TemplateEntry> {
  const templates = new Map<string, TemplateEntry>();

  for (const origin of ["bundled", "user"] as const) {
    const dir = origin === "bundled" ? bundledDir : userDir;
    if (!dir || !fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const templateDir = path.join(dir, entry.name);
      const configPath = path.join(templateDir, "template.yaml");
      if (!fs.existsSync(configPath)) continue;

      const raw = fs.readFileSync(configPath, "utf8");
      const config = yaml.load(raw) as TemplateConfig;
      templates.set(config.name, { config, dir: templateDir, origin });
    }
  }

  return templates;
}
```

- [ ] **Step 2: Write `src/template/resolver.ts`**

```ts
import path from "node:path";
import type { ResolvedTemplate, ResolvedComponentEntry, ComponentDef } from "../sdk/types.js";
import type { TemplateEntry } from "./loader.js";
import { loadComponent } from "../component/loader.js";

export async function resolveTemplate(
  name: string,
  allTemplates: Map<string, TemplateEntry>,
): Promise<ResolvedTemplate> {
  // 1. Linearize the inheritance chain
  const chain = linearize(name, allTemplates);
  const rootEntry = allTemplates.get(chain[0]);
  if (!rootEntry) throw new Error(`Template not found: ${chain[0]}`);

  // 2. Walk chain from root to leaf, merging components
  const mergedComponents = new Map<string, { sourcePath: string; defaults: Record<string, string> }>();

  for (const tplName of chain) {
    const entry = allTemplates.get(tplName);
    if (!entry) throw new Error(`Template not found in chain: ${tplName}`);

    for (const [compName, override] of Object.entries(entry.config.components ?? {})) {
      if (override.source) {
        // Total override or new component — replaces parent entirely
        const sourcePath = path.resolve(entry.dir, override.source);
        mergedComponents.set(compName, {
          sourcePath,
          defaults: override.defaults ?? {},
        });
      } else if (override.extends) {
        // Type-a partial override: merge defaults only, keep parent source
        const existing = mergedComponents.get(compName);
        if (!existing) throw new Error(`Component ${compName} extends unknown parent`);
        mergedComponents.set(compName, {
          sourcePath: existing.sourcePath,
          defaults: { ...existing.defaults, ...(override.defaults ?? {}) },
        });
      }
      // else: component not mentioned = inherited as-is
    }
  }

  // 3. Load all component defs
  const components: Record<string, ResolvedComponentEntry> = {};
  await Promise.all(
    [...mergedComponents.entries()].map(async ([compName, { sourcePath, defaults }]) => {
      const def = await loadComponent(sourcePath, "");
      components[compName] = { def, defaults };
    }),
  );

  const leafEntry = allTemplates.get(name)!;

  return {
    name,
    description: leafEntry.config.description,
    origin: leafEntry.origin,
    extendsChain: chain,
    style_defaults: leafEntry.config.style_defaults,
    components,
  };
}

function linearize(name: string, allTemplates: Map<string, TemplateEntry>): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = name;

  while (current) {
    if (visited.has(current)) {
      throw new Error(`Circular template inheritance detected: ${[...chain, current].join(" → ")}`);
    }
    visited.add(current);
    chain.unshift(current); // prepend so chain goes root → leaf
    const entry = allTemplates.get(current);
    if (!entry) throw new Error(`Template not found: ${current}`);
    current = entry.config.extends;
  }

  return chain;
}
```

- [ ] **Step 3: Write `tests/unit/template-resolver.test.ts`**

```ts
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

function makeTempTemplates(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-test-"));
  // base template with infobox
  const baseDir = path.join(dir, "base");
  fs.mkdirSync(path.join(baseDir, "components"), { recursive: true });
  fs.writeFileSync(path.join(baseDir, "template.yaml"), `
name: base
description: Base template
components:
  infobox:
    source: components/infobox.component.yaml
`);
  fs.writeFileSync(path.join(baseDir, "components", "infobox.component.yaml"), `
name: infobox
description: An info box
params:
  title: { type: string, required: true }
  accent: { type: token, required: false, default: accentColor }
slots:
  children: true
emits: |
  \\begin{infobox}{{{accent}}}{{{title}}}
  {{children}}
  \\end{infobox}
`);
  // report template that extends base with a partial override
  const reportDir = path.join(dir, "report");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "template.yaml"), `
name: report
extends: base
components:
  infobox:
    extends: base.infobox
    defaults:
      accent: warningColor
`);
  return dir;
}

describe("resolveTemplate", () => {
  it("resolves a base template with no parent", async () => {
    const dir = makeTempTemplates();
    const all = loadAllTemplates(dir);
    const resolved = await resolveTemplate("base", all);
    expect(resolved.name).toBe("base");
    expect(resolved.extendsChain).toEqual(["base"]);
    expect(resolved.components).toHaveProperty("infobox");
  });

  it("inherits components from parent template", async () => {
    const dir = makeTempTemplates();
    const all = loadAllTemplates(dir);
    const resolved = await resolveTemplate("report", all);
    expect(resolved.extendsChain).toEqual(["base", "report"]);
    expect(resolved.components).toHaveProperty("infobox");
  });

  it("merges defaults in type-a partial override", async () => {
    const dir = makeTempTemplates();
    const all = loadAllTemplates(dir);
    const resolved = await resolveTemplate("report", all);
    expect(resolved.components["infobox"]?.defaults["accent"]).toBe("warningColor");
  });

  it("throws on circular inheritance", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-circ-"));
    fs.mkdirSync(path.join(dir, "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, "a", "template.yaml"), "name: a\nextends: b\ncomponents: {}");
    fs.mkdirSync(path.join(dir, "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "b", "template.yaml"), "name: b\nextends: a\ncomponents: {}");
    const all = loadAllTemplates(dir);
    await expect(resolveTemplate("a", all)).rejects.toThrow("Circular");
  });
});
```

- [ ] **Step 4: Run template resolver tests**

```bash
cd packages/druckform && pnpm vitest run tests/unit/template-resolver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/druckform/src/template/ \
  packages/druckform/tests/unit/template-resolver.test.ts
git commit -m "feat(druckform): template resolver — single-parent inheritance, partial-merge"
```

---

### Task 5: Document parser

**Files:**
- Create: `packages/druckform/src/parse/parser.ts`
- Create: `packages/druckform/tests/unit/parser.test.ts`

**Interfaces:**
- Produces: `parseDocument(markdownPath: string) → ParsedDocument`

- [ ] **Step 1: Write `src/parse/parser.ts`**

```ts
import fs from "node:fs";
import type { ASTNode, ComponentBlock, ParsedDocument } from "../sdk/types.js";

const OPEN_RE = /^:::\s+(\S+)(.*)?$/;
const CLOSE_RE = /^:::$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  const re = new RegExp(ATTR_RE.source, "g");
  while ((match = re.exec(attrStr)) !== null) {
    attrs[match[1]!] = match[2]!;
  }
  return attrs;
}

export function parseDocument(filePath: string): ParsedDocument {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const [nodes] = parseLines(lines, 0);
  return { nodes };
}

export function parseMarkdownString(content: string): ParsedDocument {
  const lines = content.split("\n");
  const [nodes] = parseLines(lines, 0);
  return { nodes };
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
    const line = lines[i]!;
    const openMatch = OPEN_RE.exec(line);
    const closeMatch = CLOSE_RE.test(line) && !openMatch;

    if (closeMatch) {
      flushText();
      return [nodes, i]; // caller consumes the :::
    }

    if (openMatch) {
      flushText();
      const name = openMatch[1]!;
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
```

- [ ] **Step 2: Write `tests/unit/parser.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdownString } from "../../src/parse/parser.js";

describe("parseMarkdownString", () => {
  it("parses plain text as a single text node", () => {
    const doc = parseMarkdownString("Hello world\n\nMore text");
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({ type: "text", content: "Hello world\n\nMore text" });
  });

  it("parses a single component block", () => {
    const doc = parseMarkdownString(`::: infobox title="Note"\nBody text\n:::`);
    expect(doc.nodes).toHaveLength(1);
    const node = doc.nodes[0];
    expect(node?.type).toBe("component");
    if (node?.type === "component") {
      expect(node.block.name).toBe("infobox");
      expect(node.block.params["title"]).toBe("Note");
    }
  });

  it("parses text before and after a component", () => {
    const doc = parseMarkdownString("Before\n::: box title=\"A\"\nInside\n:::\nAfter");
    expect(doc.nodes).toHaveLength(3);
    expect(doc.nodes[0]?.type).toBe("text");
    expect(doc.nodes[1]?.type).toBe("component");
    expect(doc.nodes[2]?.type).toBe("text");
  });

  it("parses nested components", () => {
    const doc = parseMarkdownString(
      '::: outer title="O"\n::: inner title="I"\nText\n:::\n:::'
    );
    expect(doc.nodes).toHaveLength(1);
    const outer = doc.nodes[0];
    if (outer?.type === "component") {
      expect(outer.block.children).toHaveLength(1);
      expect(outer.block.children[0]?.type).toBe("component");
    }
  });

  it("records source line numbers", () => {
    const doc = parseMarkdownString('Line1\n::: box title="A"\nBody\n:::');
    const comp = doc.nodes[1];
    if (comp?.type === "component") {
      expect(comp.block.sourceLine).toBe(2);
    }
  });
});
```

- [ ] **Step 3: Run parser tests**

```bash
cd packages/druckform && pnpm vitest run tests/unit/parser.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/druckform/src/parse/ packages/druckform/tests/unit/parser.test.ts
git commit -m "feat(druckform): document parser — ::: component fences with nesting"
```

---

### Task 6: Diagram pre-renderer (with test stubs)

**Files:**
- Create: `packages/druckform/src/diagram/types.ts`
- Create: `packages/druckform/src/diagram/mermaid.ts`
- Create: `packages/druckform/src/diagram/plantuml.ts`
- Create: `packages/druckform/tests/unit/diagram-stubs/` (fake `mmdc` and `plantuml` scripts)

**Interfaces:**
- Produces: `prerenderDiagrams(doc, styleConfig, assetsDir, workDir) → Promise<Map<string, string>>` (fenced block → pdf path)

Note: `src/diagram/mermaid.ts` and `src/diagram/plantuml.ts` are excluded from the coverage gate.

- [ ] **Step 1: Write `src/diagram/types.ts`**

```ts
export interface DiagramResult {
  fenceContent: string;
  outputPdf: string; // absolute path to rendered PDF
}
```

- [ ] **Step 2: Write `src/diagram/mermaid.ts`**

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { StyleConfig } from "../sdk/types.js";

export function renderMermaid(
  content: string,
  styleConfig: StyleConfig,
  workDir: string,
  index: number,
): string {
  const inputFile = path.join(workDir, `mermaid-${index}.mmd`);
  const svgFile = path.join(workDir, `mermaid-${index}.svg`);
  const pdfFile = path.join(workDir, `mermaid-${index}.pdf`);

  fs.writeFileSync(inputFile, content, "utf8");

  const theme = styleConfig.diagrams?.mermaid?.theme ?? "default";
  const result = spawnSync("mmdc", ["-i", inputFile, "-o", svgFile, "-t", theme], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`mermaid rendering failed: ${result.stderr}`);
  }

  // Convert SVG → PDF using rsvg-convert
  const pdfResult = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfFile, svgFile], {
    encoding: "utf8",
  });
  if (pdfResult.status !== 0) {
    throw new Error(`SVG→PDF conversion failed: ${pdfResult.stderr}`);
  }

  return pdfFile;
}
```

- [ ] **Step 3: Write `src/diagram/plantuml.ts`**

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { StyleConfig } from "../sdk/types.js";

const PLANTUML_JAR = process.env["PLANTUML_JAR"] ?? "/usr/local/lib/plantuml.jar";

export function renderPlantUML(
  content: string,
  styleConfig: StyleConfig,
  workDir: string,
  index: number,
): string {
  const inputFile = path.join(workDir, `plantuml-${index}.puml`);
  const svgFile = path.join(workDir, `plantuml-${index}.svg`);
  const pdfFile = path.join(workDir, `plantuml-${index}.pdf`);

  // Prepend skin if configured
  let fullContent = content;
  const skinRef = styleConfig.diagrams?.plantuml?.skinRef;
  if (skinRef) {
    fullContent = `!include ${skinRef}\n${content}`;
  }
  fs.writeFileSync(inputFile, fullContent, "utf8");

  const result = spawnSync(
    "java",
    ["-jar", PLANTUML_JAR, "-tsvg", "-o", workDir, inputFile],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`PlantUML rendering failed: ${result.stderr}`);
  }

  // Convert SVG → PDF
  const pdfResult = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfFile, svgFile], {
    encoding: "utf8",
  });
  if (pdfResult.status !== 0) {
    throw new Error(`SVG→PDF conversion failed: ${pdfResult.stderr}`);
  }

  return pdfFile;
}
```

- [ ] **Step 4: Write `src/diagram/pre-render.ts`**

```ts
import type { ParsedDocument, StyleConfig } from "../sdk/types.js";
import { renderMermaid } from "./mermaid.js";
import { renderPlantUML } from "./plantuml.js";

const MERMAID_FENCE = /^```mermaid\n([\s\S]*?)```$/m;
const PLANTUML_FENCE = /^```plantuml\n([\s\S]*?)```$/m;

/**
 * Finds fenced diagram blocks in text nodes, renders them to PDF files,
 * and returns a map of original fence text → absolute PDF path.
 */
export async function prerenderDiagrams(
  doc: ParsedDocument,
  styleConfig: StyleConfig,
  workDir: string,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  let mermaidIdx = 0;
  let plantumlIdx = 0;

  function processText(text: string) {
    for (const match of text.matchAll(new RegExp(MERMAID_FENCE.source, "gm"))) {
      const fence = match[0]!;
      const content = match[1]!;
      if (!results.has(fence)) {
        results.set(fence, renderMermaid(content, styleConfig, workDir, mermaidIdx++));
      }
    }
    for (const match of text.matchAll(new RegExp(PLANTUML_FENCE.source, "gm"))) {
      const fence = match[0]!;
      const content = match[1]!;
      if (!results.has(fence)) {
        results.set(fence, renderPlantUML(content, styleConfig, workDir, plantumlIdx++));
      }
    }
  }

  function walkNodes(nodes: typeof doc.nodes) {
    for (const node of nodes) {
      if (node.type === "text") processText(node.content);
      else walkNodes(node.block.children);
    }
  }

  walkNodes(doc.nodes);
  return results;
}
```

- [ ] **Step 5: Create stub scripts for diagram tests**

Create `packages/druckform/tests/unit/diagram-stubs/mmdc`:
```bash
#!/bin/sh
# Stub: write a minimal SVG to the output path
OUTPUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) OUTPUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
echo '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>' > "$OUTPUT"
```

Create `packages/druckform/tests/unit/diagram-stubs/rsvg-convert`:
```bash
#!/bin/sh
# Stub: copy a minimal PDF placeholder to the output path
OUTPUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) OUTPUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%PDF-1.4 stub' > "$OUTPUT"
```

Make both executable:
```bash
chmod +x packages/druckform/tests/unit/diagram-stubs/mmdc
chmod +x packages/druckform/tests/unit/diagram-stubs/rsvg-convert
```

- [ ] **Step 6: Commit**

```bash
git add packages/druckform/src/diagram/ \
  packages/druckform/tests/unit/diagram-stubs/
git commit -m "feat(druckform): diagram pre-renderer — mermaid + plantuml subprocess wrappers"
```

---

### Task 7: LaTeX composer + error mapper

**Files:**
- Create: `packages/druckform/src/latex/md-to-latex.ts`
- Create: `packages/druckform/src/latex/composer.ts`
- Create: `packages/druckform/src/latex/tectonic.ts`
- Create: `packages/druckform/src/latex/error-mapper.ts`
- Create: `packages/druckform/tests/unit/error-mapper.test.ts`

**Interfaces:**
- Produces: `composeDocument(doc, template, styleConfig, diagramMap, workDir) → {tex: string, sourceMap: SourceMap}`, `runTectonic(texPath, outputPdf) → {ok, log}`, `mapErrors(log, sourceMap) → Finding[]`

- [ ] **Step 1: Write `src/latex/md-to-latex.ts`**

```ts
import { escapeTeX } from "../sdk/tex.js";

/**
 * Minimal Markdown → LaTeX converter for text nodes.
 * Handles: paragraphs, bold, italic, inline code, headings (h1-h4), unordered lists.
 * Diagram fences are replaced by their \includegraphics refs before this runs.
 */
export function mdToLatex(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      if (inList) { out.push("\\end{itemize}"); inList = false; }
      const level = headingMatch[1]!.length;
      const cmds = ["section", "subsection", "subsubsection", "paragraph"];
      const cmd = cmds[level - 1] ?? "paragraph";
      out.push(`\\${cmd}{${inlineMarkdown(headingMatch[2]!)}}`);
      continue;
    }

    // Unordered list items
    const listMatch = /^[-*]\s+(.+)$/.exec(line);
    if (listMatch) {
      if (!inList) { out.push("\\begin{itemize}"); inList = true; }
      out.push(`  \\item ${inlineMarkdown(listMatch[1]!)}`);
      continue;
    }

    if (inList && line.trim() === "") {
      out.push("\\end{itemize}");
      inList = false;
    }

    // Blank line = paragraph break
    if (line.trim() === "") {
      out.push("");
      continue;
    }

    out.push(inlineMarkdown(line));
  }

  if (inList) out.push("\\end{itemize}");
  return out.join("\n");
}

function inlineMarkdown(text: string): string {
  // Order matters: process patterns before escaping
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, t) => `\\textbf{${escapeTeX(t)}}`)
    .replace(/\*(.+?)\*/g, (_, t) => `\\textit{${escapeTeX(t)}}`)
    .replace(/`(.+?)`/g, (_, t) => `\\texttt{${escapeTeX(t)}}`)
    .replace(/^[^\\]/, (ch) => escapeTeX(ch)); // escape leading non-command char
}
```

- [ ] **Step 2: Write `src/latex/composer.ts`**

```ts
import type {
  ParsedDocument,
  ResolvedTemplate,
  StyleConfig,
  SourceMap,
  ASTNode,
} from "../sdk/types.js";
import { compileStyle, tokenMacro } from "../style/compiler.js";
import { mdToLatex } from "./md-to-latex.js";
import type { RenderCtx } from "../sdk/types.js";

interface ComposeResult {
  tex: string;
  sourceMap: SourceMap;
}

export function composeDocument(
  doc: ParsedDocument,
  template: ResolvedTemplate,
  styleConfig: StyleConfig,
  diagramMap: Map<string, string>, // fence text → pdf path
): ComposeResult {
  const sourceMap: SourceMap = new Map();
  let lineCounter = 0;

  const ctx: RenderCtx = {
    token: (name) => tokenMacro(name),
    style: {
      colors: styleConfig.tokens.colors ?? {},
      fonts: styleConfig.tokens.fonts ?? {},
      spacing: styleConfig.tokens.spacing ?? {},
    },
  };

  const stylePreamble = compileStyle(styleConfig);

  const bodyLines: string[] = [];

  function trackLines(content: string, componentName: string, sourceLine: number) {
    const newLines = content.split("\n");
    for (let i = 0; i < newLines.length; i++) {
      lineCounter++;
      sourceMap.set(lineCounter + PREAMBLE_LINES, { componentName, sourceLine });
    }
    bodyLines.push(content);
  }

  function renderNodes(nodes: ASTNode[]): string {
    return nodes.map(renderNode).join("\n");
  }

  function renderNode(node: ASTNode): string {
    if (node.type === "text") {
      let text = node.content;
      // Replace diagram fences with \includegraphics
      for (const [fence, pdfPath] of diagramMap) {
        text = text.replaceAll(fence, `\\includegraphics[width=\\linewidth]{${pdfPath}}`);
      }
      return mdToLatex(text);
    }

    // Component node
    const { block } = node;
    const entry = template.components[block.name];
    if (!entry) {
      throw new Error(`Unknown component '${block.name}' at line ${block.sourceLine}`);
    }

    // Render children first
    const childLatex = renderNodes(block.children);

    // Merge defaults with explicit params
    const mergedParams = { ...entry.defaults, ...block.params };

    // Validate and render
    const latex = entry.def.render(mergedParams, childLatex, ctx);

    sourceMap.set(lineCounter + PREAMBLE_LINES, {
      componentName: block.name,
      sourceLine: block.sourceLine,
    });

    return latex;
  }

  const body = renderNodes(doc.nodes);

  const PREAMBLE_LINES = stylePreamble.split("\n").length + 6; // rough offset

  const tex = [
    "\\documentclass{article}",
    "\\usepackage{fontspec}",
    "\\usepackage{xcolor}",
    "\\usepackage{graphicx}",
    stylePreamble,
    "\\begin{document}",
    body,
    "\\end{document}",
  ].join("\n");

  return { tex, sourceMap };
}
```

- [ ] **Step 3: Write `src/latex/tectonic.ts`**

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface TectonicResult {
  ok: boolean;
  log: string;
}

export function runTectonic(texPath: string, outputPdf: string): TectonicResult {
  const logPath = outputPdf.replace(/\.pdf$/, ".log");

  const result = spawnSync(
    "tectonic",
    [
      "--keep-logs",
      "--untrusted-input", // disables shell-escape
      "--outfmt", "pdf",
      "--outdir", path.dirname(outputPdf),
      texPath,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );

  const log = result.stdout + result.stderr;

  // Write full log to disk for human debugging
  fs.writeFileSync(logPath, log, "utf8");

  return {
    ok: result.status === 0,
    log,
  };
}
```

- [ ] **Step 4: Write `src/latex/error-mapper.ts`**

```ts
import type { Finding, SourceMap } from "../sdk/types.js";

// Tectonic log line patterns for errors
const ERROR_LINE_RE = /^(?:error|!).*?(?:line|l\.)\s*(\d+)/im;
const UNDEFINED_RE = /undefined control sequence.*?\\(\w+)/i;

export function mapErrors(log: string, sourceMap: SourceMap): Finding[] {
  const findings: Finding[] = [];
  const lines = log.split("\n");

  for (const line of lines) {
    const lineMatch = ERROR_LINE_RE.exec(line);
    if (!lineMatch) continue;

    const texLine = parseInt(lineMatch[1]!, 10);
    const entry = sourceMap.get(texLine);

    const undefMatch = UNDEFINED_RE.exec(line);
    const message = undefMatch
      ? `Undefined LaTeX command: \\${undefMatch[1]}`
      : line.trim();

    findings.push({
      severity: "error",
      component: entry?.componentName ?? "unknown",
      message,
      line: entry?.sourceLine,
    });
  }

  // Deduplicate by message + component
  return findings.filter(
    (f, i, arr) =>
      arr.findIndex((g) => g.message === f.message && g.component === f.component) === i,
  );
}

export function summarizeFinding(findings: Finding[]): string {
  const first = findings[0];
  if (!first) return "LaTeX compilation failed";
  const loc = first.line ? ` (line ${first.line})` : "";
  return `${first.component}${loc}: ${first.message}`;
}
```

- [ ] **Step 5: Write `tests/unit/error-mapper.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { mapErrors, summarizeFinding } from "../../src/latex/error-mapper.js";
import type { SourceMap } from "../../src/sdk/types.js";

describe("mapErrors", () => {
  it("extracts error line number and maps to component", () => {
    const log = "! Undefined control sequence at line 42\n";
    const sourceMap: SourceMap = new Map([
      [42, { componentName: "infobox", sourceLine: 12 }],
    ]);
    const findings = mapErrors(log, sourceMap);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.component).toBe("infobox");
    expect(findings[0]?.line).toBe(12);
  });

  it("falls back to unknown component when not in source map", () => {
    const log = "error: undefined reference at l. 99";
    const findings = mapErrors(log, new Map());
    expect(findings[0]?.component).toBe("unknown");
  });

  it("deduplicates identical findings", () => {
    const log = "! Error at line 5\n! Error at line 5\n";
    const findings = mapErrors(log, new Map());
    expect(findings.length).toBeLessThanOrEqual(1);
  });
});

describe("summarizeFinding", () => {
  it("returns a one-line summary", () => {
    const findings: import("../../src/sdk/types.js").Finding[] = [
      { severity: "error", component: "callout", message: "Missing token", line: 7 },
    ];
    expect(summarizeFinding(findings)).toBe("callout (line 7): Missing token");
  });

  it("handles empty findings", () => {
    expect(summarizeFinding([])).toBe("LaTeX compilation failed");
  });
});
```

- [ ] **Step 6: Run error mapper tests**

```bash
cd packages/druckform && pnpm vitest run tests/unit/error-mapper.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/druckform/src/latex/ packages/druckform/tests/unit/error-mapper.test.ts
git commit -m "feat(druckform): LaTeX composer, tectonic runner, error mapper"
```

---

### Task 8: CLI subcommands + bundled fixtures + golden tests

**Files:**
- Create: `packages/druckform/src/commands/templates.ts`
- Create: `packages/druckform/src/commands/components.ts`
- Create: `packages/druckform/src/commands/lint.ts`
- Create: `packages/druckform/src/commands/render.ts`
- Modify: `packages/druckform/src/cli.ts`
- Create: `packages/druckform/templates/base/` (full bundled template)
- Create: `packages/druckform/templates/report/` (full bundled template)
- Create: `packages/druckform/styles/example/style.yaml`
- Create: `packages/druckform/tests/fixtures/` (test documents)
- Create: `packages/druckform/tests/integration/lint.test.ts`

**Interfaces:**
- Consumes: all modules above
- Produces: working `druck` binary with all four subcommands; golden lint/components JSON

- [ ] **Step 1: Create bundled `base` template**

`packages/druckform/templates/base/template.yaml`:
```yaml
name: base
description: "Base template — foundational components for all documents."
components:
  infobox:
    source: components/infobox.component.yaml
```

`packages/druckform/templates/base/components/infobox.component.yaml`:
```yaml
name: infobox
description: "Boxed note with a title and optional body content."
params:
  title:  { type: string, required: true }
  accent: { type: token,  required: false, default: accent }
slots:
  children: true
emits: |
  \begin{infobox}{\druckAccent}{{{title}}}
  {{children}}
  \end{infobox}
example: |
  ::: infobox title="Note"
  Body text, **may contain** nested blocks.
  :::
```

- [ ] **Step 2: Create bundled `report` template**

`packages/druckform/templates/report/template.yaml`:
```yaml
name: report
description: "Report template — extends base with a variant-styled callout."
extends: base
components:
  infobox:
    extends: base.infobox
    defaults:
      accent: warning
  callout:
    source: components/callout.ts
```

`packages/druckform/templates/report/components/callout.ts`:
```ts
import { z } from "zod";
import { Tex, raw } from "../../../src/sdk/tex.js";
import type { Component, RenderCtx } from "../../../src/sdk/types.js";

export const schema = z.object({
  variant: z.enum(["info", "warn", "danger"]).default("info"),
  title: z.string(),
});

export const meta = {
  name: "callout",
  description: "Variant-styled callout box with a title.",
  acceptsChildren: true,
  example: '::: callout variant="warn" title="Heads up"\nBody\n:::',
  requiredTokens: ["accent", "warning"],
};

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const color = params.variant === "warn"
    ? ctx.token("warning")
    : ctx.token("accent");
  return Tex`\\begin{callout}{${raw(color)}}{${params.title}}
${raw(children)}
\\end{callout}`;
};
```

Note: The import path above assumes the template is loaded from the monorepo during development. In the Docker image, both packages are installed so `druckform` SDK is available. Update the import to `druckform` when publishing.

- [ ] **Step 3: Create example style**

`packages/druckform/styles/example/style.yaml`:
```yaml
# yaml-language-server: $schema=../../schemas/style-v1.json
$schema: "style-v1"
tokens:
  colors:
    accent:    "#2E5AAC"
    warning:   "#B26A00"
    infoboxBg: "#EEF3FB"
  fonts:
    main: "TeX Gyre Pagella"
    mono: "JetBrains Mono"
  spacing:
    blockGap: "0.8em"
diagrams:
  mermaid:  { theme: "neutral" }
  plantuml: { skinRef: "skin.puml" }
```

- [ ] **Step 4: Write `src/commands/templates.ts`**

```ts
import type { TemplatesContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import path from "node:path";

const BUNDLED_TEMPLATES = path.resolve(
  new URL("../../templates", import.meta.url).pathname,
);

export function templatesCommand(json: boolean): void {
  const all = loadAllTemplates(
    BUNDLED_TEMPLATES,
    process.env["DRUCKFORM_TEMPLATES_DIR"],
  );

  const contract: TemplatesContract = {
    schemaVersion: "1",
    templates: [...all.values()].map(({ config, origin }) => ({
      name: config.name,
      extends: config.extends ?? null,
      origin,
      description: config.description,
    })),
  };

  if (json) {
    process.stdout.write(JSON.stringify(contract, null, 2) + "\n");
  } else {
    for (const t of contract.templates) {
      const ext = t.extends ? ` (extends: ${t.extends})` : "";
      console.log(`  ${t.name}${ext} [${t.origin}]`);
    }
  }
}
```

- [ ] **Step 5: Write `src/commands/components.ts`**

```ts
import type { ComponentsContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import path from "node:path";

const BUNDLED_TEMPLATES = path.resolve(
  new URL("../../templates", import.meta.url).pathname,
);

export async function componentsCommand(template: string, json: boolean): Promise<void> {
  const all = loadAllTemplates(
    BUNDLED_TEMPLATES,
    process.env["DRUCKFORM_TEMPLATES_DIR"],
  );

  const resolved = await resolveTemplate(template, all);

  const contract: ComponentsContract = {
    schemaVersion: "1",
    template,
    components: Object.values(resolved.components).map(({ def }) => ({
      name: def.meta.name,
      description: def.meta.description,
      params: def.jsonSchema,
      acceptsChildren: def.meta.acceptsChildren,
      example: def.meta.example,
    })),
  };

  if (json) {
    process.stdout.write(JSON.stringify(contract, null, 2) + "\n");
  } else {
    for (const c of contract.components) {
      console.log(`  ${c.name} — ${c.description}`);
    }
  }
}
```

- [ ] **Step 6: Write `src/commands/lint.ts`**

```ts
import type { LintContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import { loadStyle } from "../style/validate.js";
import { extractRequiredTokens, checkTokenCoverage } from "../style/tokens.js";
import { parseDocument } from "../parse/parser.js";
import path from "node:path";

const BUNDLED_TEMPLATES = path.resolve(
  new URL("../../templates", import.meta.url).pathname,
);

export async function lintCommand(
  template: string,
  inFile: string,
  stylePath: string | undefined,
  json: boolean,
): Promise<void> {
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env["DRUCKFORM_TEMPLATES_DIR"]);
  const resolved = await resolveTemplate(template, all);
  const doc = parseDocument(inFile);
  const findings = [];

  // Validate component names
  for (const node of doc.nodes) {
    if (node.type !== "component") continue;
    if (!resolved.components[node.block.name]) {
      findings.push({
        severity: "error" as const,
        component: node.block.name,
        message: `Unknown component '${node.block.name}'`,
        line: node.block.sourceLine,
      });
    }
  }

  // Validate required params
  for (const node of doc.nodes) {
    if (node.type !== "component") continue;
    const entry = resolved.components[node.block.name];
    if (!entry) continue;
    try {
      entry.def.schema.parse({ ...entry.defaults, ...node.block.params });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      findings.push({
        severity: "error" as const,
        component: node.block.name,
        message: msg,
        line: node.block.sourceLine,
      });
    }
  }

  // Token coverage (if style provided)
  if (stylePath) {
    const styleConfig = loadStyle(stylePath);
    const required = extractRequiredTokens(resolved);
    findings.push(...checkTokenCoverage(required, resolved, styleConfig));
  }

  const contract: LintContract = {
    schemaVersion: "1",
    ok: findings.length === 0,
    findings,
  };

  if (json) {
    process.stdout.write(JSON.stringify(contract, null, 2) + "\n");
  } else {
    if (contract.ok) {
      console.log("✓ No issues found.");
    } else {
      for (const f of findings) {
        const loc = f.line ? `:${f.line}` : "";
        console.error(`[${f.severity}] ${f.component}${loc}: ${f.message}`);
      }
    }
  }

  if (!contract.ok) process.exit(1);
}
```

- [ ] **Step 7: Write `src/commands/render.ts`**

```ts
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { RenderContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import { loadStyle } from "../style/validate.js";
import { extractRequiredTokens, checkTokenCoverage } from "../style/tokens.js";
import { parseDocument } from "../parse/parser.js";
import { prerenderDiagrams } from "../diagram/pre-render.js";
import { composeDocument } from "../latex/composer.js";
import { runTectonic } from "../latex/tectonic.js";
import { mapErrors, summarizeFinding } from "../latex/error-mapper.js";

const BUNDLED_TEMPLATES = path.resolve(
  new URL("../../templates", import.meta.url).pathname,
);

export async function renderCommand(
  template: string,
  stylePath: string,
  inFile: string,
  assetsDir: string,
  outPdf: string,
  json: boolean,
): Promise<void> {
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env["DRUCKFORM_TEMPLATES_DIR"]);
  const resolved = await resolveTemplate(template, all);
  const styleConfig = loadStyle(stylePath);

  // Required-token check before invoking LaTeX
  const required = extractRequiredTokens(resolved);
  const tokenFindings = checkTokenCoverage(required, resolved, styleConfig);
  if (tokenFindings.length > 0) {
    const contract: RenderContract = {
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: summarizeFinding(tokenFindings), findings: tokenFindings },
    };
    emitResult(contract, json);
    process.exit(1);
  }

  const doc = parseDocument(inFile);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-"));

  try {
    const diagramMap = await prerenderDiagrams(doc, styleConfig, workDir);
    const { tex, sourceMap } = composeDocument(doc, resolved, styleConfig, diagramMap);

    const texPath = path.join(workDir, "document.tex");
    fs.writeFileSync(texPath, tex, "utf8");

    const { ok, log } = runTectonic(texPath, outPdf);

    if (ok) {
      const contract: RenderContract = { schemaVersion: "1", status: "ok", pdf: outPdf };
      emitResult(contract, json);
    } else {
      const findings = mapErrors(log, sourceMap);
      const contract: RenderContract = {
        schemaVersion: "1",
        status: "error",
        pdf: null,
        error: { summary: summarizeFinding(findings), findings },
      };
      emitResult(contract, json);
      process.exit(1);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function emitResult(contract: RenderContract, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(contract, null, 2) + "\n");
  } else {
    if (contract.status === "ok") {
      console.log(`✓ PDF written to ${contract.pdf}`);
    } else {
      console.error(`✗ ${contract.error?.summary}`);
      for (const f of contract.error?.findings ?? []) {
        const loc = f.line ? `:${f.line}` : "";
        console.error(`  [${f.severity}] ${f.component}${loc}: ${f.message}`);
      }
    }
  }
}
```

- [ ] **Step 8: Wire up `src/cli.ts`**

```ts
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { templatesCommand } from "./commands/templates.js";
import { componentsCommand } from "./commands/components.js";
import { lintCommand } from "./commands/lint.js";
import { renderCommand } from "./commands/render.js";

yargs(hideBin(process.argv))
  .scriptName("druck")
  .usage("$0 <command> [options]")
  .command(
    "templates",
    "List available templates (Sätze)",
    (y) => y.option("json", { type: "boolean", default: false }),
    (argv) => { templatesCommand(argv.json); },
  )
  .command(
    "components",
    "List resolved components for a template (Lettern)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }),
    async (argv) => { await componentsCommand(argv.template, argv.json); },
  )
  .command(
    "lint",
    "Validate a document against its template",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("in", { type: "string", demandOption: true })
        .option("style", { type: "string" })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await lintCommand(argv.template, argv["in"], argv.style, argv.json);
    },
  )
  .command(
    "render",
    "Render a document to PDF (produce a Druckform)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("style", { type: "string", demandOption: true })
        .option("in", { type: "string", demandOption: true })
        .option("assets", { type: "string", default: "." })
        .option("out", { type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await renderCommand(
        argv.template,
        argv.style,
        argv["in"],
        argv.assets,
        argv.out,
        argv.json,
      );
    },
  )
  .demandCommand(1, "Specify a subcommand.")
  .strict()
  .help()
  .parse();
```

- [ ] **Step 9: Create fixture document for integration tests**

`packages/druckform/tests/fixtures/documents/valid.md`:
```markdown
# Example Report

Introduction paragraph with **bold** and *italic* text.

::: infobox title="Key Finding"
This is the body of the info box.
:::

::: infobox title="Nested Example"
Outer content.
::: infobox title="Inner box"
Inner content.
:::
:::
```

`packages/druckform/tests/fixtures/documents/invalid-missing-required.md`:
```markdown
::: infobox
Missing the required title param.
:::
```

- [ ] **Step 10: Write `tests/integration/lint.test.ts`**

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintCommand } from "../../src/commands/lint.js";

// Capture stdout/stderr for --json assertions
import { vi } from "vitest";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const TEMPLATES = path.resolve(import.meta.dirname, "../../templates");

describe("lint integration", () => {
  it("reports ok for a valid document", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(String(s)); return true; });

    process.env["DRUCKFORM_TEMPLATES_DIR"] = undefined;
    // Override bundled templates path via env for test isolation
    await lintCommand(
      "base",
      path.join(FIXTURES, "documents/valid.md"),
      undefined,
      true,
    );

    const out = JSON.parse(writes.join(""));
    expect(out.schemaVersion).toBe("1");
    expect(out.ok).toBe(true);

    vi.restoreAllMocks();
  });

  it("reports error for missing required param", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(String(s)); return true; });
    const exits: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((n) => { exits.push(n ?? 0); throw new Error("exit"); });

    await expect(
      lintCommand(
        "base",
        path.join(FIXTURES, "documents/invalid-missing-required.md"),
        undefined,
        true,
      ),
    ).rejects.toThrow("exit");

    const out = JSON.parse(writes.join(""));
    expect(out.ok).toBe(false);
    expect(out.findings.length).toBeGreaterThan(0);
    expect(exits[0]).toBe(1);

    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 11: Run integration lint tests**

```bash
cd packages/druckform && pnpm vitest run tests/integration/lint.test.ts
```

Expected: PASS.

- [ ] **Step 12: Build and smoke-test the CLI**

```bash
cd packages/druckform && pnpm build
node dist/cli.js templates
node dist/cli.js components --template base --json
node dist/cli.js lint --template base --in tests/fixtures/documents/valid.md --json
```

Expected: all commands exit 0 and produce valid JSON.

- [ ] **Step 13: Commit**

```bash
git add packages/druckform/src/commands/ packages/druckform/src/cli.ts \
  packages/druckform/templates/ packages/druckform/styles/ \
  packages/druckform/tests/fixtures/ packages/druckform/tests/integration/
git commit -m "feat(druckform): CLI subcommands, bundled templates, integration tests"
```
