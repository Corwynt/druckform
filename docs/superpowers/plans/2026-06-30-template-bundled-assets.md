# Template-bundled Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a druckform template ship its own assets (logo, footer mark, watermark) and reference them from the document shell and components via `ctx.asset(ref)` / `ctx.templateDir`, with SVG auto-converted to PDF.

**Architecture:** Add `templateDir` + `asset(ref)` to `RenderCtx`. Resolution is per *defining* template: each `ResolvedComponentEntry` records the root dir of the template that defined it, and the composer hands each component a per-component `ctx` clone bound to that dir. `ctx.asset` resolves a ref against that dir (traversal-guarded), returns an **absolute** path (so it reaches tectonic's temp workdir with no copying — exactly how `block:image` works today), and converts `.svg` refs to vector PDF via `rsvg-convert` (the same binary the diagram pipeline already requires), memoized per render.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22, vitest, esbuild component loader, tectonic + `rsvg-convert` external binaries.

## Global Constraints

- TypeScript ESM with `.js` import specifiers (NodeNext). Match existing import style.
- `ctx.asset` returns an **absolute** path; never copies files into the workdir.
- SVG handling is on `ctx.asset` only. `block:image` (document `--assets`) is unchanged.
- New `ctx` members live on `RenderCtx` **only** — not on `DocumentLayout`.
- Resolution targets the **defining** template's root dir, not the leaf, and not `dirname(sourcePath)`.
- Missing `rsvg-convert` or a failed conversion is a **hard error** with an actionable message — never a silent miss.
- Traversal guard reuses `resolveAssetPath` (`src/sdk/asset-path.ts`); do not duplicate the escape check.
- Run tests with `pnpm --filter druckform test` (vitest). Tests must not require `rsvg-convert` to be installed — inject fakes.
- Out of scope (tracked separately): B1–B8 DX/docs fixes; `block:image` SVG support; watermark/footer as features.

---

### Task 1: `asset-resolver` module (resolve + guard + SVG→PDF)

Self-contained module with no dependency on the `RenderCtx` type changes. Fully unit-tested with injected fakes so no external binary is needed.

**Files:**
- Create: `packages/druckform/src/sdk/asset-resolver.ts`
- Test: `packages/druckform/tests/unit/asset-resolver.test.ts`

**Interfaces:**
- Consumes: `resolveAssetPath(assetsRoot: string, assetRef: string): string` from `src/sdk/asset-path.js` (returns absolute path; throws on absolute/escaping refs).
- Produces:
  - `convertSvgToPdf(svgPath: string, outPath: string, spawn?: SpawnFn): void`
  - `createAssetResolver(opts: AssetResolverOptions): (ref: string) => string`
  - `interface AssetResolverOptions { templateDir: string; workDir: string; cache: Map<string, string>; convertSvg?: (svgPath: string, outPath: string) => void }`

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/asset-resolver.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertSvgToPdf, createAssetResolver } from "../../src/sdk/asset-resolver.js";

let dir: string;
let workDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-asset-tpl-"));
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-asset-work-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("createAssetResolver", () => {
  it("returns the absolute path for a non-SVG asset that exists", () => {
    fs.writeFileSync(path.join(dir, "logo.pdf"), "%PDF-1.4");
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map() });
    expect(asset("logo.pdf")).toBe(path.join(dir, "logo.pdf"));
  });

  it("throws a clear error when the asset is missing", () => {
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map() });
    expect(() => asset("nope.pdf")).toThrow(/not found/i);
  });

  it("rejects path traversal", () => {
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map() });
    expect(() => asset("../secret.pdf")).toThrow(/escapes/);
  });

  it("converts an SVG and returns a workDir PDF path", () => {
    fs.writeFileSync(path.join(dir, "logo.svg"), "<svg/>");
    const convertSvg = vi.fn((_svg: string, out: string) => fs.writeFileSync(out, "%PDF"));
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map(), convertSvg });
    const out = asset("logo.svg");
    expect(out).toBe(path.join(workDir, "asset-0.pdf"));
    expect(convertSvg).toHaveBeenCalledOnce();
    expect(convertSvg).toHaveBeenCalledWith(path.join(dir, "logo.svg"), out);
  });

  it("memoizes conversion across repeated refs (converts once)", () => {
    fs.writeFileSync(path.join(dir, "logo.svg"), "<svg/>");
    const convertSvg = vi.fn((_svg: string, out: string) => fs.writeFileSync(out, "%PDF"));
    const cache = new Map<string, string>();
    const asset = createAssetResolver({ templateDir: dir, workDir, cache, convertSvg });
    const a = asset("logo.svg");
    const b = asset("logo.svg");
    expect(a).toBe(b);
    expect(convertSvg).toHaveBeenCalledOnce();
  });
});

describe("convertSvgToPdf", () => {
  it("throws an actionable error when rsvg-convert is missing (ENOENT)", () => {
    const fakeSpawn = (() => ({ error: Object.assign(new Error("x"), { code: "ENOENT" }) })) as unknown as typeof spawnSync;
    expect(() => convertSvgToPdf("/a.svg", "/b.pdf", fakeSpawn)).toThrow(/rsvg-convert/);
  });

  it("throws when conversion exits non-zero", () => {
    const fakeSpawn = (() => ({ status: 1, stderr: "boom" })) as unknown as typeof spawnSync;
    expect(() => convertSvgToPdf("/a.svg", "/b.pdf", fakeSpawn)).toThrow(/conversion failed/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter druckform exec vitest run tests/unit/asset-resolver.test.ts`
Expected: FAIL — `Cannot find module '../../src/sdk/asset-resolver.js'`.

- [ ] **Step 3: Implement the module**

Create `packages/druckform/src/sdk/asset-resolver.ts`:

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveAssetPath } from "./asset-path.js";

type SpawnFn = typeof spawnSync;

/**
 * Convert an SVG file to a vector PDF via `rsvg-convert` — the same binary the
 * diagram pipeline already requires. Hard-errors with an actionable message if
 * the binary is missing or conversion fails.
 */
export function convertSvgToPdf(svgPath: string, outPath: string, spawn: SpawnFn = spawnSync): void {
  const res = spawn("rsvg-convert", ["-f", "pdf", "-o", outPath, svgPath], { encoding: "utf8" });
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(
      `Cannot convert SVG asset '${svgPath}': the 'rsvg-convert' binary was not found. ` +
        `Install librsvg (e.g. 'brew install librsvg') — it is the same tool druckform uses for diagrams.`,
    );
  }
  if (res.status !== 0) {
    throw new Error(`SVG→PDF conversion failed for '${svgPath}': ${res.stderr ?? ""}`);
  }
}

export interface AssetResolverOptions {
  /** Absolute root dir of the template that defines the calling component. */
  templateDir: string;
  /** Scratch dir for converted SVG→PDF output (the render workdir in production). */
  workDir: string;
  /** Shared per-render memo cache: resolved source path → output path. */
  cache: Map<string, string>;
  /** Injectable for tests; defaults to convertSvgToPdf. */
  convertSvg?: (svgPath: string, outPath: string) => void;
}

/**
 * Build a `ctx.asset(ref)` resolver bound to one template directory. Resolves
 * `ref` against `templateDir` (traversal-guarded via resolveAssetPath), returns
 * an absolute path, and auto-converts `.svg` refs to PDF (memoized per render).
 */
export function createAssetResolver(opts: AssetResolverOptions): (ref: string) => string {
  const convert = opts.convertSvg ?? convertSvgToPdf;
  return (ref: string): string => {
    const resolved = resolveAssetPath(opts.templateDir, ref); // absolute; throws on traversal/absolute
    if (!fs.existsSync(resolved)) {
      throw new Error(`Template asset not found: '${ref}' (looked in ${opts.templateDir})`);
    }
    if (!ref.toLowerCase().endsWith(".svg")) {
      return resolved;
    }
    const cached = opts.cache.get(resolved);
    if (cached) return cached;
    const outPath = path.join(opts.workDir, `asset-${opts.cache.size}.pdf`);
    convert(resolved, outPath);
    opts.cache.set(resolved, outPath);
    return outPath;
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter druckform exec vitest run tests/unit/asset-resolver.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/druckform/src/sdk/asset-resolver.ts packages/druckform/tests/unit/asset-resolver.test.ts
git commit -m "feat(druckform): add asset-resolver (template-relative resolve + SVG→PDF)"
```

---

### Task 2: Record the defining template dir on each resolved component

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`ResolvedComponentEntry`)
- Modify: `packages/druckform/src/template/resolver.ts`
- Test: `packages/druckform/tests/unit/template-resolver.test.ts`

**Interfaces:**
- Produces: `ResolvedComponentEntry.templateDir: string` — absolute root dir of the template that defines the component (the template's `dir`, e.g. `templates/gradion`, NOT `dirname(sourcePath)`).

- [ ] **Step 1: Write the failing test**

Append to `packages/druckform/tests/unit/template-resolver.test.ts` a test that an inherited component keeps its parent's dir while an overriding child component gets the child's dir. Use the existing bundled `report` template (extends `base`) — its own components resolve to the `report` dir, inherited `block:*`/`document` resolve to `base`.

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

describe("ResolvedComponentEntry.templateDir", () => {
  it("points at the dir of the template that defines each component", async () => {
    const t = await resolveTemplate("report", loadAllTemplates(BUNDLED));
    // An inherited shell from `base` resolves to the base template dir.
    expect(t.components.document.templateDir).toBe(path.join(BUNDLED, "base"));
    // A component defined by `report` resolves to the report template dir.
    expect(t.components.callout.templateDir).toBe(path.join(BUNDLED, "report"));
  });
});
```

> Before writing this test, confirm the component names: run
> `pnpm --filter druckform exec vitest run tests/unit/template-resolver.test.ts` is not needed yet — instead inspect `templates/report/template.yaml` and `templates/report/components/` to pick a component that `report` actually defines (the plan assumes `callout`; if `report` defines a different component, substitute its name and the test still holds). `document` is inherited from `base` in every template.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/template-resolver.test.ts`
Expected: FAIL — `templateDir` is `undefined` / property does not exist.

- [ ] **Step 3: Add the type field**

In `packages/druckform/src/sdk/types.ts`, extend `ResolvedComponentEntry` (currently `def` / `defaults` / `sourcePath`):

```ts
export interface ResolvedComponentEntry {
  def: ComponentDef;
  defaults: Record<string, string>; // merged param defaults from inheritance chain
  sourcePath: string; // absolute path to the component's source file
  templateDir: string; // absolute root dir of the template that defines this component
}
```

- [ ] **Step 4: Thread `templateDir` through the resolver**

In `packages/druckform/src/template/resolver.ts`:

1. Widen the merge-map value type (was `{ sourcePath: string; defaults: ... }`):

```ts
  const mergedComponents = new Map<
    string,
    { sourcePath: string; templateDir: string; defaults: Record<string, string> }
  >();
```

2. Auto-discovery loop — add `templateDir: entry.dir`:

```ts
    for (const [name, sourcePath] of discoverComponents(entry)) {
      mergedComponents.set(name, { sourcePath, templateDir: entry.dir, defaults: {} });
    }
```

3. Explicit `override.source` branch — add `templateDir: entry.dir`:

```ts
        const sourcePath = path.resolve(entry.dir, override.source);
        mergedComponents.set(compName, {
          sourcePath,
          templateDir: entry.dir,
          defaults: override.defaults ?? {},
        });
```

4. `override.extends` (partial override keeps parent source) — keep the parent's defining dir:

```ts
        mergedComponents.set(compName, {
          sourcePath: existing.sourcePath,
          templateDir: existing.templateDir,
          defaults: { ...existing.defaults, ...(override.defaults ?? {}) },
        });
```

5. Load loop — destructure and set on the resolved entry:

```ts
    [...mergedComponents.entries()].map(async ([compName, { sourcePath, templateDir, defaults }]) => {
      const def = await loadComponent(sourcePath, "");
      components[compName] = { def, defaults, sourcePath, templateDir };
    }),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/template-resolver.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/template/resolver.ts packages/druckform/tests/unit/template-resolver.test.ts
git commit -m "feat(druckform): record defining template dir on resolved components"
```

---

### Task 3: Add `templateDir`/`asset` to `RenderCtx` and wire per-component ctx

Adding required members to `RenderCtx` breaks every inline `RenderCtx` literal until updated; this task updates all of them in one commit so the build stays green. The composer builds a per-component `ctx` clone bound to each component's `templateDir`, threads a scratch `workDir`, and surfaces resolution/conversion errors as a render `Finding`.

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`RenderCtx`)
- Modify: `packages/druckform/src/latex/composer.ts`
- Modify: `packages/druckform/src/commands/render.ts`
- Modify: `packages/druckform/src/commands/doctor.ts`
- Modify: `packages/druckform/tests/helpers/render-component.ts`
- Modify: `packages/druckform/tests/unit/frontmatter-context.test.ts`
- Modify: `packages/druckform/tests/unit/component-declarative.test.ts`
- Test: `packages/druckform/tests/unit/composer-asset.test.ts` (new)

**Interfaces:**
- Consumes: `createAssetResolver` (Task 1); `ResolvedComponentEntry.templateDir` (Task 2).
- Produces: `RenderCtx.templateDir: string`; `RenderCtx.asset(ref: string): string`. `composeDocument(doc, template, styleConfig, diagramMap, assetsRoot, workDir?)` — new optional 6th param (defaults to `os.tmpdir()`).

- [ ] **Step 1: Create the committed fixture template**

This fixture is a minimal theme that overrides the `document` shell to reference a bundled asset. It MUST live inside the repo (so its TS shell can resolve `druckform`/`zod` via the repo `node_modules` — the live B2 caveat; a `/tmp` location would fail to load).

Create `packages/druckform/tests/fixtures/templates/logotheme/template.yaml`:

```yaml
name: logotheme
extends: base
components:
  document:
    source: ./document.ts
```

Create `packages/druckform/tests/fixtures/templates/logotheme/logo.pdf` (a stub — its content is never compiled in unit tests, only its path is read):

```
%PDF-1.4
```

Create `packages/druckform/tests/fixtures/templates/logotheme/document.ts`:

```ts
import type { DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "asset-test shell", acceptsChildren: true };

export function render(_p: unknown, _c: string, ctx: RenderCtx, el?: DocumentLayout): string {
  const layout = el as DocumentLayout;
  return [
    `% logo=${ctx.asset("logo.pdf")}`,
    `% dir=${ctx.templateDir}`,
    layout.stylePreamble,
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/druckform/tests/unit/composer-asset.test.ts`, loading the committed fixture:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");
const LOGO_DIR = path.join(FIXTURES, "logotheme");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("logotheme", loadAllTemplates(BUNDLED, FIXTURES));
});

describe("composer exposes template assets to the shell", () => {
  it("splices the absolute asset path and template dir into the shell output", () => {
    const { tex } = composeDocument(parseMarkdownString("# Hi"), template, style, new Map(), "/assets");
    expect(tex).toContain(`% logo=${path.join(LOGO_DIR, "logo.pdf")}`);
    expect(tex).toContain(`% dir=${LOGO_DIR}`);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/composer-asset.test.ts`
Expected: FAIL — TypeScript error that `ctx.asset`/`ctx.templateDir` do not exist, or a runtime "ctx.asset is not a function".

- [ ] **Step 4: Add the `RenderCtx` members**

In `packages/druckform/src/sdk/types.ts`, extend `RenderCtx`:

```ts
export interface RenderCtx {
  /** Returns the LaTeX macro name for a style token, e.g. \accentcolor */
  token(name: string): string;
  style: StyleTokens;
  /** Document frontmatter values (with template-schema defaults applied), e.g. title/author. */
  frontmatter: Record<string, string>;
  /** Absolute root dir of the template that defines the calling component. */
  templateDir: string;
  /**
   * Resolve a template-bundled asset to an absolute path. SVG refs are converted
   * to PDF. Use the returned path directly in \includegraphics — it reaches
   * tectonic's temp workdir without copying.
   */
  asset(ref: string): string;
}
```

- [ ] **Step 5: Wire the composer (per-component ctx + workDir + error→Finding)**

In `packages/druckform/src/latex/composer.ts`:

1. Add imports near the top:

```ts
import os from "node:os";
import { createAssetResolver } from "../sdk/asset-resolver.js";
import type { ResolvedComponentEntry } from "../sdk/types.js";
```

(Add `ResolvedComponentEntry` to the existing type import block if you prefer; keep one import per the file's style.)

2. Add `workDir` as the optional 6th param:

```ts
export function composeDocument(
  doc: ParsedDocument,
  template: ResolvedTemplate,
  styleConfig: StyleConfig,
  diagramMap: Map<string, string>, // fence text → pdf path
  assetsRoot: string,
  workDir: string = os.tmpdir(),
): ComposeResult {
```

3. Rename the existing `ctx` to `baseCtx` and add a per-component ctx factory + shared SVG cache. Replace the current `const ctx: RenderCtx = { ... }` block with:

```ts
  const baseCtx = {
    token: (name: string) => tokenMacro(name),
    style: {
      colors: styleConfig.tokens.colors ?? {},
      fonts: styleConfig.tokens.fonts ?? {},
      spacing: styleConfig.tokens.spacing ?? {},
    },
    frontmatter,
  };

  // Converted-SVG memo cache, shared across every component in this render.
  const svgCache = new Map<string, string>();
  function ctxFor(entry: ResolvedComponentEntry): RenderCtx {
    return {
      ...baseCtx,
      templateDir: entry.templateDir,
      asset: createAssetResolver({ templateDir: entry.templateDir, workDir, cache: svgCache }),
    };
  }
```

4. Build the shell ctx and use it for the shell render and for body text (`mdToLatex`). Replace `const shell = docEntry.def.render({}, "", ctx, layout);` with:

```ts
  const shellCtx = ctxFor(docEntry);
  const shell = docEntry.def.render({}, "", shellCtx, layout);
```

5. In `renderNode`, the text branch currently calls `mdToLatex(text, { template, ctx, assetsRoot })`. Change `ctx` to `shellCtx`:

```ts
      let latex = mdToLatex(text, { template, ctx: shellCtx, assetsRoot });
```

6. In `renderNode`, the component branch currently calls `entry.def.render(mergedParams, childLatex, ctx)`. Change to a per-component ctx:

```ts
    const latex = entry.def.render(mergedParams, childLatex, ctxFor(entry));
```

- [ ] **Step 6: Thread `workDir` from `renderToFile` and catch compose errors as a Finding**

In `packages/druckform/src/commands/render.ts`, inside `renderToFile`, replace the line:

```ts
    const { tex, sourceMap } = composeDocument(doc, resolved, styleConfig, diagramMap, assetsDir);
```

with (passing `workDir` and converting a thrown compose error into an error contract):

```ts
    let tex: string;
    let sourceMap: import("../sdk/types.js").SourceMap;
    try {
      ({ tex, sourceMap } = composeDocument(
        doc,
        resolved,
        styleConfig,
        diagramMap,
        assetsDir,
        workDir,
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        schemaVersion: "1",
        status: "error",
        pdf: null,
        error: {
          summary: message,
          findings: [{ severity: "error", component: "document", message }],
        },
      };
    }
```

(The surrounding `try { ... } finally { fs.rmSync(workDir, ...) }` still cleans up the workdir.)

- [ ] **Step 7: Update the `doctor` probe ctx**

In `packages/druckform/src/commands/doctor.ts`, the `checkDocumentShell` probe builds a `RenderCtx`. The probe must not touch the filesystem or `rsvg-convert`, so give it a non-resolving `asset`. Ensure `path` is imported at the top (`import path from "node:path";` — add if missing), then update the probe ctx:

```ts
  const ctx: RenderCtx = {
    token: (n) => `\\druck${n.charAt(0).toUpperCase()}${n.slice(1)}`,
    style: { colors: {}, fonts: {}, spacing: {} },
    frontmatter: {},
    templateDir: entry.templateDir,
    asset: (ref) => path.join(entry.templateDir, ref),
  };
```

- [ ] **Step 8: Update the test ctx helper and inline test ctx literals**

In `packages/druckform/tests/helpers/render-component.ts`, add `path` import and extend `testCtx`:

```ts
import path from "node:path";
// ...
export function testCtx(over: Partial<RenderCtx> = {}): RenderCtx {
  const templateDir = "/test/template";
  return {
    token: (n) => `\\druck${n.charAt(0).toUpperCase()}${n.slice(1)}`,
    style: { colors: {}, fonts: {}, spacing: {} },
    frontmatter: {},
    templateDir,
    asset: (ref) => path.resolve(templateDir, ref),
    ...over,
  };
}
```

In `packages/druckform/tests/unit/frontmatter-context.test.ts`, add the two fields to the inline `ctx` literal (around line 18):

```ts
    const ctx: RenderCtx = {
      token: (n) => `\\${n}`,
      style: { colors: {}, fonts: {}, spacing: {} },
      frontmatter: { title: "A&B" },
      templateDir: "/test/template",
      asset: (ref) => path.resolve("/test/template", ref),
    };
```

(`path` is already imported in that file.)

In `packages/druckform/tests/unit/component-declarative.test.ts`, add the two fields to the module-level `ctx` literal (around line 16). `path` is already imported:

```ts
const ctx: RenderCtx = {
  token: (name) => `\\druck${name.charAt(0).toUpperCase() + name.slice(1)}`,
  style: { colors: {}, fonts: {}, spacing: {} },
  frontmatter: {},
  templateDir: "/test/template",
  asset: (ref) => path.resolve("/test/template", ref),
};
```

- [ ] **Step 9: Run the full druckform test suite**

Run: `pnpm --filter druckform test`
Expected: PASS — including the new `composer-asset.test.ts` and all previously-green tests (composer-document, composer-gfm, frontmatter-context, component-declarative, doctor, etc.). If any pre-existing composer test fails, it means the base ctx shape changed observably — it must not; only fields were added.

- [ ] **Step 10: Commit**

```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/latex/composer.ts packages/druckform/src/commands/render.ts packages/druckform/src/commands/doctor.ts packages/druckform/tests/helpers/render-component.ts packages/druckform/tests/unit/frontmatter-context.test.ts packages/druckform/tests/unit/component-declarative.test.ts packages/druckform/tests/unit/composer-asset.test.ts packages/druckform/tests/fixtures/templates/logotheme/
git commit -m "feat(druckform): expose ctx.asset/ctx.templateDir; per-component render ctx"
```

---

### Task 4: End-to-end render integration (logo-in-header worked example)

Validates the whole thread through `renderCommand` (tectonic mocked, as existing integration tests do): resolver `templateDir` → composer per-component ctx → absolute asset path in the emitted `.tex`. Reuses the `logotheme` fixture from Task 3.

**Files:**
- Test: `packages/druckform/tests/integration/template-assets.test.ts` (new)

**Interfaces:**
- Consumes: the committed fixture `tests/fixtures/templates/logotheme/` (Task 3); `renderCommand` from `src/commands/render.js`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/integration/template-assets.test.ts`. Mock tectonic and capture the written `.tex` by spying on `fs.writeFileSync` (the composer's tex is written to `document.tex` in the workdir before tectonic runs).

```ts
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/latex/tectonic.js", () => ({
  runTectonic: vi.fn().mockReturnValue({ ok: true, log: "" }),
}));

import { renderCommand } from "../../src/commands/render.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const TEMPLATES = path.join(FIXTURES, "templates");
const LOGO_DIR = path.join(TEMPLATES, "logotheme");

afterEach(() => vi.restoreAllMocks());

describe("template-bundled assets end-to-end", () => {
  it("emits the absolute bundled-logo path into the document .tex", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = TEMPLATES;

    // Capture the document.tex content the composer writes before tectonic runs.
    const real = fs.writeFileSync;
    let texContent = "";
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, ...rest) => {
      if (String(file).endsWith("document.tex")) texContent = String(data);
      return (real as unknown as typeof fs.writeFileSync)(file, data as never, ...(rest as []));
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const outPdf = path.join(import.meta.dirname, "../../dist/test-assets-output.pdf");
    await renderCommand(
      "logotheme",
      undefined,
      path.join(FIXTURES, "documents/valid.md"),
      FIXTURES,
      outPdf,
      true, // --json
    );

    expect(texContent).toContain(`% logo=${path.join(LOGO_DIR, "logo.pdf")}`);
    expect(texContent).toContain(`% dir=${LOGO_DIR}`);

    delete process.env.DRUCKFORM_TEMPLATES_DIR;
  });
});
```

> If `tests/fixtures/documents/valid.md` does not exist, substitute any existing fixture markdown file (check `tests/fixtures/documents/`), or create a one-line `# Hi` markdown fixture. The document body is irrelevant to this assertion.

- [ ] **Step 2: Run the test to verify it fails (or confirm it already passes)**

Run: `pnpm --filter druckform exec vitest run tests/integration/template-assets.test.ts`
Expected: PASS is acceptable here — the wiring landed in Task 3, so this integration test is a guardrail proving it works through the real `renderCommand` entry point. If it FAILS, the workdir-threading from Step 6 of Task 3 is wrong (the composer is still using `os.tmpdir()` instead of the render workdir, or the per-component ctx is not reaching the shell) — fix Task 3 wiring, not the test.

- [ ] **Step 3: Run the full suite + typecheck + lint**

Run: `pnpm --filter druckform test`
Expected: PASS (entire suite).

Run: `pnpm -w build` (or the repo's typecheck command — check `package.json` scripts; `turbo build` compiles all packages and surfaces any type regressions across `druckform` and `druckform-mcp`).
Expected: PASS — no type errors from the new `RenderCtx` members in any consumer.

Run: `pnpm biome check .` (repo uses biome — see `biome.json`).
Expected: clean (or auto-fixable with `pnpm biome check --write .`).

- [ ] **Step 4: Commit**

```bash
git add packages/druckform/tests/integration/template-assets.test.ts
git commit -m "test(druckform): end-to-end template-bundled asset render"
```

---

## Notes for the implementer

- **Why no SVG-through-composer test:** the SVG conversion + memoization logic is fully covered in Task 1 with an injected fake converter. The composer path is identical regardless of caller, so the composer/integration tests use a `.pdf` asset (no binary needed) and assert the absolute path is spliced in. This keeps CI free of an `rsvg-convert` dependency while still proving the full wiring.
- **Why `workDir` is optional with an `os.tmpdir()` default:** ~7 existing `composeDocument` test callers pass 5 args. The default keeps them compiling. Real renders always pass the mkdtemp workdir from `renderToFile`, so converted SVGs land in a dir that is cleaned up automatically.
- **Defining-dir vs leaf-dir:** confirmed semantics — a component shipped by template X resolves X's assets even when rendered under a child. The `override.extends` (partial) branch deliberately keeps the parent's `templateDir`.
- **B2 caveat is live:** the `logotheme` fixture must live inside the repo (`tests/fixtures/templates/`) so its TS shell can resolve `druckform`/`zod` via the repo `node_modules`. Do not move it to `/tmp`.
