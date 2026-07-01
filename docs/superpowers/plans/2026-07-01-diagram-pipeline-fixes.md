# Diagram Pipeline Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four diagram-pipeline defects — Mermaid labels dropped by librsvg, ignored brand `themeVariables`, diagrams/images overflowing the page, and no per-instance height control — then document the behaviour.

**Architecture:** Mermaid renders SVG `<text>` (not HTML) via an mmdc `-c` config that also carries brand `themeVariables`; the composer emits diagram/image includes bounded by overridable `\textheight`-fraction macros; a `maxheight=` markdown directive (fence info-string for diagrams, image title for images) overrides the cap per instance.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22, vitest, `mmdc` + `rsvg-convert` (mocked in tests), LaTeX (graphicx + adjustbox), biome.

## Global Constraints

- TypeScript ESM with `.js` import specifiers (NodeNext). Match existing style per file.
- Per-instance `maxheight=<n>` means a fraction of `\textheight` (`maxheight=0.5` → `0.5\textheight`); `<n>` is a positive decimal. Same rule for diagrams and images.
- When Mermaid `themeVariables` are present, force `theme:"base"` in the `-c` config and pass **no** `-t` flag (the CLI rejects `-t base`). Otherwise pass `-t <theme ?? "default">` and omit `theme` from the config.
- The mmdc config always includes `{ htmlLabels: false, flowchart: { htmlLabels: false } }` (Issue 1).
- Default height caps use overridable macros `\druckDiagramMaxHeight` and `\druckImageMaxHeight`, both `0.82\textheight`, defined in engine-core; shells may `\renewcommand` them. Diagrams use graphicx `keepaspectratio`; images use adjustbox `max totalheight` (shrink-only).
- YAGNI: no headless-Chromium path; no style-token/DocumentLayout field for the cap.
- Tests must not require `mmdc`/`rsvg-convert`/`tectonic` — mock `spawnSync`.
- Run `pnpm biome check <changed files>` before each commit; the branch must stay lint-clean. Tests: `pnpm --filter druckform test` (full) / `pnpm --filter druckform exec vitest run <path>` (focused).

---

### Task 1: Issue 2 — schema + types for inline `themeVariables`

**Files:**
- Modify: `packages/druckform/src/style/validate.ts` (mermaid schema, ~line 42-48)
- Modify: `packages/druckform/src/sdk/types.ts` (`StyleConfig.diagrams.mermaid`, ~line 71)
- Test: `packages/druckform/tests/unit/style-validate.test.ts` (create, or extend if it exists)

**Interfaces:**
- Produces: `StyleConfig.diagrams.mermaid.themeVariables?: Record<string, string>` (inline brand colours), alongside the existing `theme?` and `themeVariablesRef?`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/style-validate.test.ts` (if a style-validation test file already exists, append the `describe` block instead and skip the duplicate imports):

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadStyle } from "../../src/style/validate.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-style-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeStyle(obj: unknown): string {
  const p = path.join(dir, "style.json");
  fs.writeFileSync(p, JSON.stringify(obj), "utf8");
  return p;
}

describe("style schema: mermaid.themeVariables", () => {
  it("accepts an inline themeVariables object", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: {},
      diagrams: { mermaid: { theme: "base", themeVariables: { primaryColor: "#FFE7D1", lineColor: "#FF6b00" } } },
    });
    const cfg = loadStyle(p);
    expect(cfg.diagrams?.mermaid?.themeVariables?.primaryColor).toBe("#FFE7D1");
  });

  it("still accepts themeVariablesRef", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: {},
      diagrams: { mermaid: { themeVariablesRef: "brand.json" } },
    });
    expect(loadStyle(p).diagrams?.mermaid?.themeVariablesRef).toBe("brand.json");
  });
});
```

> Confirm `loadStyle`'s import path and return shape by reading `src/style/validate.ts` first (it is imported elsewhere as `loadStyle`). If it throws on unknown keys today (ajv `additionalProperties:false`), the first test will fail before the schema change — that is the RED.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/style-validate.test.ts`
Expected: FAIL — the inline-`themeVariables` case is rejected by the schema (validation error on the unknown `themeVariables` property).

- [ ] **Step 3: Add `themeVariables` to the schema**

In `packages/druckform/src/style/validate.ts`, extend the `mermaid` properties (currently `theme` + `themeVariablesRef`) so it reads:

```ts
        mermaid: {
          type: "object",
          properties: {
            theme: { type: "string" },
            themeVariablesRef: { type: "string" },
            themeVariables: { type: "object", additionalProperties: { type: "string" } },
          },
          additionalProperties: false,
        },
```

- [ ] **Step 4: Add the type**

In `packages/druckform/src/sdk/types.ts`, change the mermaid diagram type (~line 71) to:

```ts
    mermaid?: { theme?: string; themeVariablesRef?: string; themeVariables?: Record<string, string> };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/style-validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm biome check packages/druckform/src/style/validate.ts packages/druckform/src/sdk/types.ts packages/druckform/tests/unit/style-validate.test.ts
git add packages/druckform/src/style/validate.ts packages/druckform/src/sdk/types.ts packages/druckform/tests/unit/style-validate.test.ts
git commit -m "feat(druckform): accept inline mermaid themeVariables in style schema (Issue 2)"
```

---

### Task 2: Issues 1 & 2 — Mermaid config (labels + brand colours)

**Files:**
- Modify: `packages/druckform/src/diagram/mermaid.ts`
- Modify: `packages/druckform/src/diagram/pre-render.ts` (pass `styleDir` to `renderMermaid`)
- Test: `packages/druckform/tests/unit/mermaid-render.test.ts` (create)

**Interfaces:**
- Consumes: `StyleConfig.diagrams.mermaid.{theme,themeVariablesRef,themeVariables}` (Task 1); `resolveAssetPath(root, ref)` from `src/sdk/asset-path.js`.
- Produces: `renderMermaid(content, styleConfig, workDir, index, styleDir?)` — new optional 5th param `styleDir` (mirrors `renderPlantUML`).

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/mermaid-render.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
}));

import { spawnSync } from "node:child_process";
import { renderMermaid } from "../../src/diagram/mermaid.js";
import type { StyleConfig } from "../../src/sdk/types.js";

let workDir: string;
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-mmd-"));
  vi.mocked(spawnSync).mockClear();
});
afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }));

function mmdcArgs(): string[] {
  const call = vi.mocked(spawnSync).mock.calls.find((c) => c[0] === "mmdc");
  if (!call) throw new Error("mmdc was not invoked");
  return call[1] as string[];
}
function readConfig(): Record<string, unknown> {
  const cfgPath = path.join(workDir, "mermaid-0.config.json");
  return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
}

const baseStyle: StyleConfig = { $schema: "style-v1", tokens: {} };

describe("renderMermaid config", () => {
  it("always disables htmlLabels so librsvg keeps the text", () => {
    renderMermaid("graph TD; A-->B", baseStyle, workDir, 0);
    const cfg = readConfig();
    expect(cfg.htmlLabels).toBe(false);
    expect((cfg.flowchart as Record<string, unknown>).htmlLabels).toBe(false);
    expect(mmdcArgs()).toContain("-c");
  });

  it("passes -t <theme> and omits config.theme when no themeVariables", () => {
    const style: StyleConfig = { $schema: "style-v1", tokens: {}, diagrams: { mermaid: { theme: "forest" } } };
    renderMermaid("graph TD; A-->B", style, workDir, 0);
    expect(mmdcArgs()).toEqual(expect.arrayContaining(["-t", "forest"]));
    expect(readConfig().theme).toBeUndefined();
  });

  it("forces theme:base + themeVariables in config and drops -t when inline vars are set", () => {
    const style: StyleConfig = {
      $schema: "style-v1", tokens: {},
      diagrams: { mermaid: { theme: "default", themeVariables: { primaryColor: "#FFE7D1", lineColor: "#FF6b00" } } },
    };
    renderMermaid("graph TD; A-->B", style, workDir, 0);
    const cfg = readConfig();
    expect(cfg.theme).toBe("base");
    expect((cfg.themeVariables as Record<string, string>).lineColor).toBe("#FF6b00");
    expect(mmdcArgs()).not.toContain("-t");
  });

  it("loads themeVariablesRef from styleDir when no inline vars", () => {
    const styleDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-styledir-"));
    fs.writeFileSync(path.join(styleDir, "brand.json"), JSON.stringify({ lineColor: "#123456" }));
    const style: StyleConfig = { $schema: "style-v1", tokens: {}, diagrams: { mermaid: { themeVariablesRef: "brand.json" } } };
    renderMermaid("graph TD; A-->B", style, workDir, 0, styleDir);
    const cfg = readConfig();
    expect(cfg.theme).toBe("base");
    expect((cfg.themeVariables as Record<string, string>).lineColor).toBe("#123456");
    fs.rmSync(styleDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/mermaid-render.test.ts`
Expected: FAIL — no config file is written (the `readConfig` calls throw / `-c` absent from args).

- [ ] **Step 3: Rewrite `renderMermaid`**

Replace the body of `packages/druckform/src/diagram/mermaid.ts` with:

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveAssetPath } from "../sdk/asset-path.js";
import type { StyleConfig } from "../sdk/types.js";

export function renderMermaid(
  content: string,
  styleConfig: StyleConfig,
  workDir: string,
  index: number,
  styleDir?: string,
): string {
  const inputFile = path.join(workDir, `mermaid-${index}.mmd`);
  const svgFile = path.join(workDir, `mermaid-${index}.svg`);
  const pdfFile = path.join(workDir, `mermaid-${index}.pdf`);
  const configFile = path.join(workDir, `mermaid-${index}.config.json`);

  fs.writeFileSync(inputFile, content, "utf8");

  const mermaidCfg = styleConfig.diagrams?.mermaid;
  const theme = mermaidCfg?.theme ?? "default";

  // Brand colours: inline themeVariables win; otherwise load themeVariablesRef.
  let themeVariables = mermaidCfg?.themeVariables;
  if (!themeVariables && mermaidCfg?.themeVariablesRef) {
    const root = styleDir ?? workDir;
    const refPath = resolveAssetPath(root, mermaidCfg.themeVariablesRef);
    try {
      themeVariables = JSON.parse(fs.readFileSync(refPath, "utf8")) as Record<string, string>;
    } catch (err) {
      throw new Error(
        `Failed to load mermaid themeVariablesRef '${mermaidCfg.themeVariablesRef}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // htmlLabels:false forces SVG <text> labels (librsvg cannot render the HTML in
  // <foreignObject> that Mermaid emits by default, so it would drop every label).
  const config: Record<string, unknown> = { htmlLabels: false, flowchart: { htmlLabels: false } };
  const args = ["-i", inputFile, "-o", svgFile];
  if (themeVariables) {
    // themeVariables are only honoured under the "base" theme, and `-t base` is
    // rejected by the mmdc CLI — so set the theme in the config and drop -t.
    config.theme = "base";
    config.themeVariables = themeVariables;
  } else {
    args.push("-t", theme);
  }
  fs.writeFileSync(configFile, JSON.stringify(config), "utf8");
  args.push("-c", configFile);

  const result = spawnSync("mmdc", args, { encoding: "utf8" });
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

- [ ] **Step 4: Pass `styleDir` to `renderMermaid` in pre-render**

In `packages/druckform/src/diagram/pre-render.ts`, line 27, add the `styleDir` argument:

```ts
        results.set(fence, renderMermaid(content, styleConfig, workDir, mermaidIdx++, styleDir));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/mermaid-render.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite**

Run: `pnpm --filter druckform test`
Expected: PASS — no regressions (the `renderMermaid` signature gained an optional trailing param; existing callers are unaffected).

- [ ] **Step 7: Commit**

```bash
pnpm biome check packages/druckform/src/diagram/mermaid.ts packages/druckform/src/diagram/pre-render.ts packages/druckform/tests/unit/mermaid-render.test.ts
git add packages/druckform/src/diagram/mermaid.ts packages/druckform/src/diagram/pre-render.ts packages/druckform/tests/unit/mermaid-render.test.ts
git commit -m "fix(druckform): mermaid emits SVG text labels + honours themeVariables (Issues 1,2)"
```

---

### Task 3: Issues 3 & 4 (diagrams) — height cap macros, per-diagram `maxheight`, diagramMap value shape

**Files:**
- Create: `packages/druckform/src/diagram/fence-info.ts` (the `maxheight=` parser)
- Modify: `packages/druckform/src/diagram/pre-render.ts` (fence regex info-string, `Map` value shape)
- Modify: `packages/druckform/src/latex/composer.ts` (engine-core macros, diagram include, `diagramMap` param type)
- Test: `packages/druckform/tests/unit/fence-info.test.ts` (create); `packages/druckform/tests/unit/composer-diagram.test.ts` (update)

**Interfaces:**
- Produces: `parseMaxHeightFraction(info: string | null | undefined): string | undefined` — returns `"<n>\\textheight"` for `maxheight=<positive-decimal>` found in `info`, else `undefined`.
- Produces: `prerenderDiagrams(...)` now returns `Map<string, { pdfPath: string; maxHeight?: string }>`; `composeDocument`'s `diagramMap` param has that type.
- Produces: engine-core defines `\druckDiagramMaxHeight` and `\druckImageMaxHeight` (both `0.82\textheight`). (`\druckImageMaxHeight` is consumed by Task 4.)

- [ ] **Step 1: Write the failing test for the parser**

Create `packages/druckform/tests/unit/fence-info.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMaxHeightFraction } from "../../src/diagram/fence-info.js";

describe("parseMaxHeightFraction", () => {
  it("parses maxheight=<n> into a \\textheight fraction", () => {
    expect(parseMaxHeightFraction("maxheight=0.5")).toBe("0.5\\textheight");
    expect(parseMaxHeightFraction(" maxheight=0.82 ")).toBe("0.82\\textheight");
    expect(parseMaxHeightFraction("maxheight=1")).toBe("1\\textheight");
  });
  it("returns undefined for absent/malformed values", () => {
    expect(parseMaxHeightFraction("")).toBeUndefined();
    expect(parseMaxHeightFraction(null)).toBeUndefined();
    expect(parseMaxHeightFraction(undefined)).toBeUndefined();
    expect(parseMaxHeightFraction("maxheight=")).toBeUndefined();
    expect(parseMaxHeightFraction("maxheight=big")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/fence-info.test.ts`
Expected: FAIL — module `src/diagram/fence-info.js` does not exist.

- [ ] **Step 3: Implement the parser**

Create `packages/druckform/src/diagram/fence-info.ts`:

```ts
/**
 * Parse a `maxheight=<n>` directive (a positive decimal) out of a fence
 * info-string or an image title, returning the LaTeX height as a fraction of
 * `\textheight` (e.g. "0.5\\textheight"), or undefined when absent/malformed.
 * The same rule applies to diagram fences and image titles.
 */
export function parseMaxHeightFraction(info: string | null | undefined): string | undefined {
  if (!info) return undefined;
  const m = info.match(/maxheight=(\d*\.?\d+)/);
  return m ? `${m[1]}\\textheight` : undefined;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/fence-info.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the existing composer-diagram test to the new map shape + assertions**

Rewrite `packages/druckform/tests/unit/composer-diagram.test.ts` so the `diagramMap` uses the object value and the assertions expect the bounded include:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
});

describe("composer diagram substitution", () => {
  it("substitutes a fence with a height-capped include (default macro, no leaked placeholder)", () => {
    const doc = parseMarkdownString("Intro\n\n```mermaid\ngraph TD; A-->B\n```\n");
    const fence = "```mermaid\ngraph TD; A-->B\n```";
    const diagramMap = new Map([[fence, { pdfPath: "/tmp/mermaid-0.pdf" }]]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain(
      "\\includegraphics[width=\\linewidth,height=\\druckDiagramMaxHeight,keepaspectratio]{/tmp/mermaid-0.pdf}",
    );
    expect(tex).toContain("\\newcommand{\\druckDiagramMaxHeight}{0.82\\textheight}");
    expect(tex).toContain("\\newcommand{\\druckImageMaxHeight}{0.82\\textheight}");
    expect(tex).not.toMatch(/DRUCKFORM\\?_?DIAGRAM/);
  });

  it("uses a per-diagram maxHeight when provided", () => {
    const doc = parseMarkdownString("```mermaid\ngraph TD; A-->B\n```\n");
    const fence = "```mermaid\ngraph TD; A-->B\n```";
    const diagramMap = new Map([[fence, { pdfPath: "/tmp/m.pdf", maxHeight: "0.5\\textheight" }]]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain(
      "\\includegraphics[width=\\linewidth,height=0.5\\textheight,keepaspectratio]{/tmp/m.pdf}",
    );
  });

  it("substitutes multiple diagrams independently", () => {
    const doc = parseMarkdownString(
      "```mermaid\ngraph TD; A-->B\n```\n\nmiddle\n\n```mermaid\ngraph TD; C-->D\n```\n",
    );
    const diagramMap = new Map([
      ["```mermaid\ngraph TD; A-->B\n```", { pdfPath: "/tmp/mermaid-0.pdf" }],
      ["```mermaid\ngraph TD; C-->D\n```", { pdfPath: "/tmp/mermaid-1.pdf" }],
    ]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain("{/tmp/mermaid-0.pdf}");
    expect(tex).toContain("{/tmp/mermaid-1.pdf}");
    expect(tex).not.toMatch(/DRUCKFORM\\?_?DIAGRAM/);
  });
});
```

- [ ] **Step 6: Run the composer-diagram test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/composer-diagram.test.ts`
Expected: FAIL — the composer still emits `width=\linewidth` only, iterates the map as `[fence, pdfPath]` (now an object → `{pdfPath}` stringifies wrongly), and engine-core lacks the macros.

- [ ] **Step 7: Add the engine-core macros**

In `packages/druckform/src/latex/composer.ts`, extend the `ENGINE_CORE` array (currently ends with `"\\usepackage[normalem]{ulem}"`) to define the two cap macros:

```ts
const ENGINE_CORE = [
  "\\usepackage{fontspec}",
  "\\usepackage{xcolor}",
  "\\usepackage{graphicx}",
  "\\usepackage{hyperref}",
  "\\usepackage[normalem]{ulem}",
  // Default max heights for diagrams/images so tall graphics never overflow the
  // page. A document shell may \\renewcommand either to tune the cap.
  "\\newcommand{\\druckDiagramMaxHeight}{0.82\\textheight}",
  "\\newcommand{\\druckImageMaxHeight}{0.82\\textheight}",
].join("\n");
```

- [ ] **Step 8: Change the `diagramMap` param type and the include emission**

In `packages/druckform/src/latex/composer.ts`:

1. Change the signature param (line ~43) from `diagramMap: Map<string, string>, // fence text → pdf path` to:

```ts
  diagramMap: Map<string, { pdfPath: string; maxHeight?: string }>, // fence text → rendered pdf + optional per-diagram height
```

2. Replace the diagram placeholder loop (the `for (const [fence, pdfPath] of diagramMap)` block) with:

```ts
      for (const [fence, { pdfPath, maxHeight }] of diagramMap) {
        // Placeholder must survive mdToLatex's escapeTeX untouched: letters and
        // digits only (no `_` — escapeTeX turns `_` into `\_`, which would break
        // the post-pass replaceAll below). The `END` terminator keeps no index a
        // prefix of another (e.g. "...1END" never matches inside "...10END").
        const placeholder = `DRUCKFORMDIAGRAM${idx++}END`;
        const heightArg = maxHeight ?? "\\druckDiagramMaxHeight";
        placeholders.set(
          placeholder,
          `\\begin{center}\\includegraphics[width=\\linewidth,height=${heightArg},keepaspectratio]{${pdfPath}}\\end{center}`,
        );
        text = text.replaceAll(fence, placeholder);
      }
```

- [ ] **Step 9: Change the pre-render `Map` value shape + capture the fence info-string**

In `packages/druckform/src/diagram/pre-render.ts`:

1. Add the import:

```ts
import { parseMaxHeightFraction } from "./fence-info.js";
```

2. Change the fence regexes to capture an optional info-string after the language:

```ts
const MERMAID_FENCE = /^```mermaid([^\n]*)\n([\s\S]*?)```$/m;
const PLANTUML_FENCE = /^```plantuml([^\n]*)\n([\s\S]*?)```$/m;
```

3. Change the return type and both `results.set(...)` sites so the value is the object and the content group is now `match[2]` (info is `match[1]`):

```ts
): Promise<Map<string, { pdfPath: string; maxHeight?: string }>> {
  const results = new Map<string, { pdfPath: string; maxHeight?: string }>();
  let mermaidIdx = 0;
  let plantumlIdx = 0;

  function processText(text: string) {
    for (const match of text.matchAll(new RegExp(MERMAID_FENCE.source, "gm"))) {
      const fence = match[0] ?? "";
      const maxHeight = parseMaxHeightFraction(match[1]);
      const content = match[2] ?? "";
      if (!results.has(fence)) {
        const pdfPath = renderMermaid(content, styleConfig, workDir, mermaidIdx++, styleDir);
        results.set(fence, { pdfPath, ...(maxHeight ? { maxHeight } : {}) });
      }
    }
    for (const match of text.matchAll(new RegExp(PLANTUML_FENCE.source, "gm"))) {
      const fence = match[0] ?? "";
      const maxHeight = parseMaxHeightFraction(match[1]);
      const content = match[2] ?? "";
      if (!results.has(fence)) {
        const pdfPath = renderPlantUML(content, styleConfig, workDir, plantumlIdx++, styleDir);
        results.set(fence, { pdfPath, ...(maxHeight ? { maxHeight } : {}) });
      }
    }
  }
```

(Leave `walkNodes` and the rest unchanged. Note `renderMermaid` already takes `styleDir` from Task 2.)

- [ ] **Step 10: Run the composer + full suite to verify green**

Run: `pnpm --filter druckform exec vitest run tests/unit/composer-diagram.test.ts tests/unit/fence-info.test.ts`
Expected: PASS.
Run: `pnpm --filter druckform test`
Expected: PASS — the `diagramMap` type change flows through `render.ts` (which only forwards it) with no other consumers.

- [ ] **Step 11: Commit**

```bash
pnpm biome check packages/druckform/src/diagram/fence-info.ts packages/druckform/src/diagram/pre-render.ts packages/druckform/src/latex/composer.ts packages/druckform/tests/unit/fence-info.test.ts packages/druckform/tests/unit/composer-diagram.test.ts
git add packages/druckform/src/diagram/fence-info.ts packages/druckform/src/diagram/pre-render.ts packages/druckform/src/latex/composer.ts packages/druckform/tests/unit/fence-info.test.ts packages/druckform/tests/unit/composer-diagram.test.ts
git commit -m "feat(druckform): diagram height cap macros + per-diagram maxheight (Issues 3,4)"
```

---

### Task 4: Issues 3 & 4 (images) — `block:image` default cap + `maxheight=` title directive

**Files:**
- Modify: `packages/druckform/templates/base/components/block-image.ts`
- Test: `packages/druckform/tests/unit/block-image.test.ts` (create)

**Interfaces:**
- Consumes: `\druckImageMaxHeight` (defined in engine-core by Task 3); the `maxheight=<n>` → `<n>\textheight` rule (same as `parseMaxHeightFraction`, inlined here — `block:image` is a bundled component and cannot import internal `src/` modules; only `druckform`/`zod` resolve).

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/block-image.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const IMG = path.resolve(import.meta.dirname, "../../templates/base/components/block-image.ts");

describe("block:image height cap", () => {
  it("applies the default image cap when there is no directive", async () => {
    const out = await renderComponent(IMG, {}, {
      element: { kind: "image", src: "/abs/logo.pdf", alt: "logo", title: null },
    });
    expect(out).toBe("\\includegraphics[max width=\\linewidth, max totalheight=\\druckImageMaxHeight]{/abs/logo.pdf}");
  });

  it("uses a per-image maxheight from the title directive", async () => {
    const out = await renderComponent(IMG, {}, {
      element: { kind: "image", src: "/abs/tall.pdf", alt: "t", title: "maxheight=0.5" },
    });
    expect(out).toBe("\\includegraphics[max width=\\linewidth, max totalheight=0.5\\textheight]{/abs/tall.pdf}");
  });

  it("falls back to the default cap for a non-directive title", async () => {
    const out = await renderComponent(IMG, {}, {
      element: { kind: "image", src: "/abs/x.pdf", alt: "x", title: "A photo" },
    });
    expect(out).toContain("max totalheight=\\druckImageMaxHeight");
  });
});
```

> `renderComponent(sourcePath, params, { element })` is the existing helper in `tests/helpers/render-component.ts` (used by other component tests). Confirm its signature before running.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/block-image.test.ts`
Expected: FAIL — the current component emits `\includegraphics[max width=\linewidth]{...}` with no `max totalheight`.

- [ ] **Step 3: Update `block:image`**

Replace the `render` function body in `packages/druckform/templates/base/components/block-image.ts`:

```ts
import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:image", description: "Markdown image", acceptsChildren: false };
export const preamble = "\\usepackage[export]{adjustbox}"; // provides "max width=" / "max totalheight=" keys

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "image") return "";
  // A `maxheight=<n>` directive in the image title caps this image at <n>\textheight;
  // otherwise fall back to the theme-overridable \druckImageMaxHeight default.
  const m = element.title?.match(/maxheight=(\d*\.?\d+)/);
  const maxHeight = m ? `${m[1]}\\textheight` : "\\druckImageMaxHeight";
  return `\\includegraphics[max width=\\linewidth, max totalheight=${maxHeight}]{${element.src}}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/block-image.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite + doctor on the base template**

Run: `pnpm --filter druckform test`
Expected: PASS. Existing `block:image`/`block-components` tests that asserted the old `[max width=\linewidth]` string must be updated if any exist — search: `grep -rn "max width=..linewidth..{" packages/druckform/tests` and fix any stale exact-match assertions to include `, max totalheight=\\druckImageMaxHeight`.
Run: `pnpm --filter druckform exec druck doctor --template base` (or the repo's doctor invocation)
Expected: clean.

- [ ] **Step 6: Commit**

```bash
pnpm biome check packages/druckform/templates/base/components/block-image.ts packages/druckform/tests/unit/block-image.test.ts
git add packages/druckform/templates/base/components/block-image.ts packages/druckform/tests/unit/block-image.test.ts
git commit -m "feat(druckform): block:image default height cap + maxheight directive (Issues 3,4)"
```

---

### Task 5: Docs — Mermaid label limitation, themeVariables, height caps, maxheight syntax

Pure documentation. Update the authoring skill and extending docs to describe the four behaviours. No unit tests; verify claims against the code from Tasks 1–4.

**Files:**
- Modify: `claude-plugin/skills/druckform-authoring/SKILL.md`
- Modify: `docs/extending-druckform.md`

**Prerequisite:** read `src/diagram/mermaid.ts`, `src/diagram/fence-info.ts`, `src/latex/composer.ts` (ENGINE_CORE), and `templates/base/components/block-image.ts` so the prose matches the shipped code.

- [ ] **Step 1: Mermaid labels + brand colours (Issues 1 & 2)**

Add a "Mermaid diagrams" note to `docs/extending-druckform.md` (near the existing diagram/style docs):

```markdown
Mermaid labels are rendered as SVG text (druckform sets `htmlLabels:false`), because
the SVG→PDF step (`rsvg-convert`/librsvg) cannot render the HTML that Mermaid emits
in `<foreignObject>` by default. **Consequence:** rich HTML inside labels (bold,
links, `<br>`) is not supported — use plain-text labels.

Brand colours: set `diagrams.mermaid.themeVariables` inline in the style/template …

    diagrams:
      mermaid:
        themeVariables: { primaryColor: "#FFE7D1", primaryBorderColor: "#FF6b00",
                          lineColor: "#FF6b00", primaryTextColor: "#1A1A1A" }

… or point `diagrams.mermaid.themeVariablesRef` at a JSON file (resolved beside the
style file). When `themeVariables` are present druckform forces Mermaid's `base`
theme (the only one that honours all variables); `theme` alone selects a named
theme (default/forest/dark/neutral).
```

- [ ] **Step 2: Height caps + override macros (Issue 3)**

Add to `docs/extending-druckform.md` (and a one-line mention in `SKILL.md`):

```markdown
Diagrams and images are capped at `0.82\textheight` by default so tall graphics never
overflow the page (aspect ratio preserved; only oversized graphics shrink). A document
shell can retune the caps:

    \renewcommand{\druckDiagramMaxHeight}{0.7\textheight}
    \renewcommand{\druckImageMaxHeight}{0.5\textheight}
```

- [ ] **Step 3: Per-instance `maxheight` syntax (Issue 4)**

Add to `docs/extending-druckform.md` and `SKILL.md`:

```markdown
Override the height of a single diagram or image from Markdown with `maxheight=<n>`,
where `<n>` is a fraction of the text height:

- Diagram — in the fence info-string:  ```mermaid maxheight=0.5
- Image — in the title:  ![alt](figure.pdf "maxheight=0.5")

`maxheight=0.5` caps that one graphic at `0.5\textheight`, overriding the default.
```

- [ ] **Step 4: Verify docs consistency**

- `grep -n "htmlLabels\|themeVariables\|druckDiagramMaxHeight\|druckImageMaxHeight\|maxheight" docs/extending-druckform.md claude-plugin/skills/druckform-authoring/SKILL.md` — confirm each documented name matches the code (macros spelled exactly `\druckDiagramMaxHeight`/`\druckImageMaxHeight`; the directive is `maxheight=`).
- Confirm no snippet claims rich-HTML Mermaid labels work.
- biome does not process `.md` (no-op) — skip.

- [ ] **Step 5: Commit**

```bash
git add claude-plugin/skills/druckform-authoring/SKILL.md docs/extending-druckform.md
git commit -m "docs(druckform): mermaid labels/brand colours, diagram/image height caps, maxheight (Issues 1-4)"
```

---

## Notes for the implementer

- **Task order:** 1 → 2 → 3 → 4 → 5. Task 3 defines `\druckImageMaxHeight` (engine-core) and the `maxheight=` rule that Task 4 relies on; Task 1's type is used by Task 2.
- **The `diagramMap` type change (Task 3) is cross-cutting** — producer (`pre-render.ts`), consumer (`composer.ts`), and `composer-diagram.test.ts` must change together in that one task, or the build breaks. `render.ts` only forwards the map, so it needs no change beyond type-flow.
- **`block:image` inlines the `maxheight=` regex** rather than importing `parseMaxHeightFraction`: it is a bundled component and only `druckform`/`zod` resolve for it (per the B2 loader). The rule is identical and documented; the duplication is one line.
- **Keep the branch biome-clean** — run `pnpm biome check` before each commit.
