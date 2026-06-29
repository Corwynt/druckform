# Extensibility Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make templates self-contained: (A) a template declares its **style** inline and merges it down the `extends` chain, with an optional external override; (B) the **document LaTeX shell becomes an overrideable `document` component** (YAML or TS), with the engine-core packages kept composer-injected.

**Design source:** `docs/superpowers/specs/2026-06-29-extensibility-roadmap-design.md` §4.

**Tech Stack:** TypeScript (ESM), `zod`, `markdown-it`, `vitest`, `tsup`, pnpm workspace.

## Global Constraints

- Node.js ≥ 22; pnpm; tests via `vitest`. Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- **Commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing; contract changes are additive.
- Do **Part A (style)** before **Part B (document component)** — B reuses A's resolved style.
- Build `druckform` (`pnpm --filter druckform build`) before any test that loads a TS component importing a *new* package export (the fixture imports from `"druckform"` → `dist`), same as Phase 1's `tokenRef`.

---

## Design notes (read before implementing)

**1. Engine-core ordering is forced, not a free choice.** LaTeX requires `\documentclass` to precede every `\usepackage`. Decision B keeps `fontspec`/`xcolor`/`graphicx`/`hyperref`/`ulem` composer-injected and non-overridable. The only way to honor both is:

```
[composer]  \documentclass{<documentclass>}      ← value chosen by the document component/frontmatter
[composer]  <engine-core \usepackage lines>      ← fixed, non-overridable
[component] <stylePreamble> <componentPreamble> <custom preamble> \begin{document} <body> \end{document}
```

So the `document` component **owns everything after the engine core** and **chooses the documentclass value** (via the payload), but does **not** emit the literal `\documentclass` line or the engine packages. This refines the spec's §4.2.3 illustrative example (which showed the component emitting `\documentclass`); the refinement is a consequence of decision B + LaTeX rules, not a new decision. `xcolor` is added to the engine core (the style preamble's `\definecolor`/`\color` need it; it was already a fixed package today).

**2. Source map via a body marker (no hand-counted `PREAMBLE_LINES`).** The document component places a `DRUCKFORM_BODY` marker where the body goes. The composer renders the shell first (independent of the body), locates the marker to derive the prefix line count, then substitutes the rendered body. This removes the brittle `+7` constant and survives an arbitrary custom wrapper.

**3. `document` is reserved.** Like `block:*`: any template may override `document`; `base` ships the default; it is **not invocable** from the document body (`::: document` is rejected). Its own `preamble` (if any) is **excluded** from the deduped component preamble (it is the preamble owner).

---

## Part A — Style belongs to the template

### Task A1: `style` on the template config + a merge utility

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (add `style?` to `TemplateConfig` and `ResolvedTemplate`; remove dead `style_defaults`)
- Create: `packages/druckform/src/style/merge.ts` (`mergeStyle`)
- Test: `packages/druckform/tests/unit/style-merge.test.ts`

**Interfaces:**
- `TemplateConfig.style?: StyleConfigInput` and `ResolvedTemplate.style?: StyleConfig` where `StyleConfigInput` is a partial style (tokens/diagrams optional).
- `mergeStyle(base: StyleConfig | undefined, over: StyleConfig | undefined): StyleConfig` — deep-merges `tokens.colors`, `tokens.fonts`, `tokens.spacing`, and `diagrams`; `over` wins per key.

- [ ] **Step 1: Write the failing test** — `style-merge.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mergeStyle } from "../../src/style/merge.js";

describe("mergeStyle", () => {
  it("deep-merges tokens with over winning per key", () => {
    const base = { $schema: "style-v1", tokens: { colors: { accent: "#111111", warning: "#222222" } } };
    const over = { $schema: "style-v1", tokens: { colors: { accent: "#999999" }, spacing: { gap: "1em" } } };
    expect(mergeStyle(base, over)).toEqual({
      $schema: "style-v1",
      tokens: { colors: { accent: "#999999", warning: "#222222" }, fonts: {}, spacing: { gap: "1em" } },
    });
  });
  it("returns a normalized empty style when both are undefined", () => {
    expect(mergeStyle(undefined, undefined)).toEqual({ $schema: "style-v1", tokens: { colors: {}, fonts: {}, spacing: {} } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**
```bash
pnpm --filter druckform exec vitest run tests/unit/style-merge.test.ts
```

- [ ] **Step 3: Implement `mergeStyle`** — `src/style/merge.ts`:
```ts
import type { StyleConfig } from "../sdk/types.js";

export function mergeStyle(
  base: StyleConfig | undefined,
  over: StyleConfig | undefined,
): StyleConfig {
  const b = base?.tokens ?? {};
  const o = over?.tokens ?? {};
  const merged: StyleConfig = {
    $schema: over?.$schema ?? base?.$schema ?? "style-v1",
    tokens: {
      colors: { ...(b.colors ?? {}), ...(o.colors ?? {}) },
      fonts: { ...(b.fonts ?? {}), ...(o.fonts ?? {}) },
      spacing: { ...(b.spacing ?? {}), ...(o.spacing ?? {}) },
    },
  };
  const diagrams = { ...(base?.diagrams ?? {}), ...(over?.diagrams ?? {}) };
  if (Object.keys(diagrams).length > 0) merged.diagrams = diagrams;
  return merged;
}
```

- [ ] **Step 4: Update the types**

In `src/sdk/types.ts`:
- Remove `style_defaults?: string;` from both `TemplateConfig` and `ResolvedTemplate`.
- Add `style?: StyleConfig;` to `TemplateConfig` (templates may declare a partial style — typed loosely as `StyleConfig` whose inner maps are all optional already) and `style?: StyleConfig;` to `ResolvedTemplate` (the merged-down result).

- [ ] **Step 5: Run the test + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/unit/style-merge.test.ts
pnpm --filter druckform typecheck
```
Note: removing `style_defaults` may surface a reference in `resolver.ts` — Task A2 fixes it; if typecheck flags it now, proceed to A2 before re-checking.

- [ ] **Step 6: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/style/merge.ts packages/druckform/tests/unit/style-merge.test.ts
git commit -m "feat(druckform): add template style config and a style merge utility"
```

### Task A2: Resolver merges template style down the chain

**Files:**
- Modify: `packages/druckform/src/template/resolver.ts`
- Test: extend `packages/druckform/tests/unit/template-resolver.test.ts`

- [ ] **Step 1: Write the failing test** — add to `template-resolver.test.ts` a case: a child template declaring `style.tokens.colors.accent` overrides the parent's; assert `resolved.style.tokens.colors.accent` is the child value and inherited keys remain. (Use the existing fixture-writing helper in that file, or the `loadAllTemplates(BUNDLED, userDir)` pattern from `reserved-namespace.test.ts`.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — in `resolveTemplate`:
- Remove the dead `style_defaults` passthrough (lines ~67-69).
- Walk the chain (root→leaf) accumulating style with `mergeStyle`:
```ts
import { mergeStyle } from "../style/merge.js";
// ...inside resolveTemplate, while iterating `chain` root→leaf:
let mergedStyle: StyleConfig | undefined;
for (const tplName of chain) {
  const entry = allTemplates.get(tplName);
  // ...existing component merge...
  if (entry?.config.style) mergedStyle = mergeStyle(mergedStyle, entry.config.style);
}
// ...in the returned object:
...(mergedStyle ? { style: mergedStyle } : {}),
```
(Fold the style accumulation into the existing chain loop rather than adding a second loop.)

- [ ] **Step 4: Run the test + typecheck.**

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/template/resolver.ts packages/druckform/tests/unit/template-resolver.test.ts
git commit -m "feat(druckform): merge template-declared style down the extends chain"
```

### Task A3: Wire template style into render/lint; make external `--style` optional

**Files:**
- Modify: `packages/druckform/src/commands/render.ts`
- Modify: `packages/druckform/src/commands/lint.ts`
- Modify: `packages/druckform/src/cli.ts` (render `--style` no longer `demandOption`)
- Modify: `packages/druckform/templates/base/template.yaml` (give `base` a minimal default `style` so there is always a baseline)
- Test: `packages/druckform/tests/integration/style-in-template.test.ts`

**Interfaces:**
- `renderCommand(template, stylePath: string | undefined, inFile, assetsDir, outPdf, json)` — `stylePath` optional.
- Effective style = `mergeStyle(resolved.style, stylePath ? loadStyle(stylePath) : undefined)`.

- [ ] **Step 1: Write the failing integration test** — render (compose only, no tectonic) a doc with `--template` that has a `style` block and **no** external style; assert the composed `.tex` contains the template's `\definecolor{druckAccent}{HTML}{...}`. Then with an external override style, assert the override color wins.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Give `base` a baseline style** — in `templates/base/template.yaml`, add:
```yaml
style:
  tokens:
    colors:
      accent: "#2E5AAC"
```

- [ ] **Step 4: Make `--style` optional in the CLI** — in `cli.ts`, change the render command's `.option("style", { type: "string", demandOption: true })` to `.option("style", { type: "string" })`.

- [ ] **Step 5: Compute the effective style in `render.ts` and `lint.ts`**
- `render.ts`: replace `const styleConfig = loadStyle(stylePath);` with:
```ts
const externalStyle = stylePath ? loadStyle(stylePath) : undefined;
const styleConfig = mergeStyle(resolved.style, externalStyle);
```
  and adjust the `renderCommand` signature so `stylePath` is `string | undefined`. The diagram skin base dir: use `stylePath ? path.dirname(stylePath) : assetsDir`.
- `lint.ts`: when checking token coverage, build the effective style the same way (`mergeStyle(resolved.style, stylePath ? loadStyle(stylePath) : undefined)`), so coverage runs against the merged style even with no external file.
- `cli.ts` render handler still passes `argv.style` (now possibly `undefined`).

- [ ] **Step 6: Run the integration test + the full suite + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/integration/style-in-template.test.ts
pnpm --filter druckform exec vitest run
pnpm --filter druckform typecheck
```
Expected: PASS (existing `render`/`lint`/`composer` tests that pass an explicit style still work — the merge with `resolved.style` is additive).

- [ ] **Step 7: Commit**
```bash
git add packages/druckform/src/commands/render.ts packages/druckform/src/commands/lint.ts packages/druckform/src/cli.ts packages/druckform/templates/base/template.yaml packages/druckform/tests/integration/style-in-template.test.ts
git commit -m "feat(druckform): templates provide default style; external --style becomes an optional override"
```

---

## Part B — The document shell as an overrideable component

### Task B1: `DocumentLayout` payload + generalized render contract

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (add `DocumentLayout`; widen the render 4th arg)
- Modify: `packages/druckform/src/index.ts` (export `DocumentLayout` type)
- Modify: `packages/druckform/src/component/typescript.ts` and `declarative.ts` (accept the widened 4th arg — declarative ignores `BlockElement`/`DocumentLayout` except its document slots, see B4)
- Test: `packages/druckform/tests/unit/document-payload.test.ts`

**Interfaces:**
```ts
export type DocumentLayout = {
  kind: "document";
  documentclass: string;     // class name the composer will emit (default "article")
  stylePreamble: string;     // compiled style (raw LaTeX)
  componentPreamble: string; // deduped component preambles (raw LaTeX), excludes `document`
  frontmatter: Record<string, string>;  // {} in Phase 2; populated in Phase 3
};
```
- `Component`/`ComponentDef.render` 4th arg becomes `element?: BlockElement | DocumentLayout`.

- [ ] **Step 1: Write the failing test** — a TS fixture `document`-style component that returns `KIND:${element?.kind}` and echoes `element.stylePreamble`; load via `loadComponent`, call `render({}, "", ctx, { kind: "document", documentclass: "article", stylePreamble: "S", componentPreamble: "C", frontmatter: {} })`, assert output contains `KIND:document` and `S`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Add `DocumentLayout` and widen the contract** in `types.ts`:
- Add the `DocumentLayout` type next to `BlockElement`.
- Change `Component<T>`'s 4th param and `ComponentDef.render`'s 4th param from `element?: BlockElement` to `element?: BlockElement | DocumentLayout`.

- [ ] **Step 4: Export the type** — add `DocumentLayout` to the `export type { … }` list in `src/index.ts`.

- [ ] **Step 5: Thread through the loaders** — in `typescript.ts` the wrapper already forwards `element`; ensure its local types allow the union. In `declarative.ts` widen the `_element` param type to `BlockElement | DocumentLayout` (still ignored here until B4).

- [ ] **Step 6: Build, run the test + typecheck**
```bash
pnpm --filter druckform build
pnpm --filter druckform exec vitest run tests/unit/document-payload.test.ts
pnpm --filter druckform typecheck
```

- [ ] **Step 7: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/index.ts packages/druckform/src/component/typescript.ts packages/druckform/src/component/declarative.ts packages/druckform/tests/fixtures/components/* packages/druckform/tests/unit/document-payload.test.ts
git commit -m "feat(druckform): add DocumentLayout payload and widen the render contract"
```

### Task B2: Default `document` component in `base`

**Files:**
- Create: `packages/druckform/templates/base/components/document.ts`
- Modify: `packages/druckform/templates/base/template.yaml` (register `document`)
- Modify: `packages/druckform/src/template/loader.ts` (reserve the `document` name like `block:*`)
- Test: `packages/druckform/tests/unit/document-component.test.ts`

- [ ] **Step 1: Write the failing test** — load `document.ts`, render with a `DocumentLayout` payload, assert the output:
  - contains the body marker `DRUCKFORM_BODY`,
  - contains `\begin{document}` and `\end{document}`,
  - splices `stylePreamble` and `componentPreamble`,
  - does **not** contain `\documentclass` or engine `\usepackage` lines (those are composer-injected).

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Create `document.ts`**:
```ts
import { z } from "zod";
import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "document", description: "Document shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
```
(Note: the default component does NOT emit `\documentclass` or engine packages — the composer prepends those. `documentclass` from the payload is consumed by the composer in B3.)

- [ ] **Step 4: Register `document` in `base/template.yaml`**:
```yaml
  document:
    source: components/document.ts
```

- [ ] **Step 5: Reserve the `document` name in the loader** — in `loader.ts`, reject a **user** template that declares `document` only if we decide to forbid override… **do not** forbid override (templates may override it). Instead, no loader change is required for naming; B3 adds the "not invocable from body" guard. (Skip this step — kept for traceability.)

- [ ] **Step 6: Build, run the test**
```bash
pnpm --filter druckform build
pnpm --filter druckform exec vitest run tests/unit/document-component.test.ts
```

- [ ] **Step 7: Commit**
```bash
git add packages/druckform/templates/base/components/document.ts packages/druckform/templates/base/template.yaml packages/druckform/tests/unit/document-component.test.ts
git commit -m "feat(druckform): ship a default overrideable document shell component in base"
```

### Task B3: Composer inversion — render via the `document` component, marker-based source map

**Files:**
- Modify: `packages/druckform/src/latex/composer.ts`
- Test: extend `packages/druckform/tests/unit/composer-gfm.test.ts` (or a new `composer-document.test.ts`) including a **source-map alignment** assertion.

- [ ] **Step 1: Write the failing tests**
  - The composed `.tex` still begins with `\documentclass{article}` followed by the engine-core `\usepackage` lines (`fontspec`, `xcolor`, `graphicx`, `hyperref`, `ulem`), then style preamble, then `\begin{document}`, body, `\end{document}`.
  - A `::: document …` block in the body is rejected with a clear error.
  - **Source-map test:** compose a known doc; pick a body line; assert `sourceMap` maps its `.tex` line to the correct source `.md` line (proving the marker-derived offset is correct).

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Rewrite the assembly in `composeDocument`**
- Keep building `ctx`, `stylePreamble`.
- Collect `componentPreamble` from `template.components` **excluding** the `document` entry.
- Resolve the document component: `const docEntry = template.components.document` (must exist — throw a helpful error if missing, like the `block:*` guard).
- Determine `documentclass` (default `"article"`; later overridable via params/frontmatter).
- Render the shell **before** the body:
```ts
const ENGINE_CORE = [
  "\\usepackage{fontspec}",
  "\\usepackage{xcolor}",
  "\\usepackage{graphicx}",
  "\\usepackage{hyperref}",
  "\\usepackage[normalem]{ulem}",
].join("\n");
const shell = docEntry.def.render({}, "", ctx, {
  kind: "document",
  documentclass,
  stylePreamble,
  componentPreamble,
  frontmatter: {},
});
const head = `\\documentclass{${documentclass}}\n${ENGINE_CORE}`;
const full = `${head}\n${shell}`;            // shell contains exactly one DRUCKFORM_BODY
const bodyMarkerIdx = full.indexOf("DRUCKFORM_BODY");
if (bodyMarkerIdx < 0) throw new Error("document component must include the body marker");
const PREAMBLE_LINES = full.slice(0, bodyMarkerIdx).split("\n").length - 1;
```
- Render the body **after** computing `PREAMBLE_LINES` (the existing `renderNodes`/`renderNode`/`trackLines` machinery, now using this `PREAMBLE_LINES`).
- In `renderNode`, reject body invocation of the reserved shell: `if (block.name === "document") throw new Error("'document' is the page shell and cannot be used as a ::: component");` (and likewise guard `block:` if not already).
- Final tex: `const tex = full.replace("DRUCKFORM_BODY", body);`
- Remove the old `texParts`/`+7` block.

- [ ] **Step 4: Run the tests + the full suite + typecheck**
```bash
pnpm --filter druckform exec vitest run
pnpm --filter druckform typecheck
```
Expected: the existing `composer-gfm`, `gfm-render`, `lint`, `render` (mocked tectonic) tests still pass; source-map test passes.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/latex/composer.ts packages/druckform/tests/unit/composer-document.test.ts
git commit -m "feat(druckform): render documents through the overrideable document shell; marker-based source map"
```

### Task B4: Declarative `document` overrides (body/style/component/documentclass slots)

**Files:**
- Modify: `packages/druckform/src/component/declarative.ts` (substitute document-payload slots)
- Test: `packages/druckform/tests/unit/document-declarative.test.ts`

**Interfaces:** when a declarative component receives a `DocumentLayout` element, substitute raw slots: `{{body}}` → `DRUCKFORM_BODY`, `{{stylePreamble}}`, `{{componentPreamble}}`, `{{documentclass}}`.

- [ ] **Step 1: Write the failing test** — a declarative `document.component.yaml` fixture with an `emits` using `{{stylePreamble}}`/`{{componentPreamble}}`/`{{body}}`; load + render with a `DocumentLayout`; assert slots are substituted (raw, unescaped) and `{{body}}` → `DRUCKFORM_BODY`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — in `declarative.ts` `render`, after the existing param/children substitution, add:
```ts
if (element && element.kind === "document") {
  output = output
    .replaceAll("{{stylePreamble}}", element.stylePreamble)
    .replaceAll("{{componentPreamble}}", element.componentPreamble)
    .replaceAll("{{documentclass}}", element.documentclass)
    .replaceAll("{{body}}", "DRUCKFORM_BODY");
}
```
(These are raw substitutions, like `{{children}}`.)

- [ ] **Step 4: Build, run the test + typecheck.**

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/component/declarative.ts packages/druckform/tests/fixtures/** packages/druckform/tests/unit/document-declarative.test.ts
git commit -m "feat(druckform): support declarative document shell overrides via raw slots"
```

### Task B5: End-to-end override test (TS + declarative)

**Files:**
- Create: `packages/druckform/tests/fixtures/templates/customdoc/` (a template overriding `document`, TS form)
- Test: `packages/druckform/tests/integration/document-override.test.ts`

- [ ] **Step 1: Write the test** — a fixture template `customdoc` (extends base) overriding `document` to emit a distinctive marker (e.g. a `\usepackage[a4paper]{geometry}` line and a `%CUSTOMDOC` comment). Compose a kitchen-sink doc with `--template customdoc`; assert the output contains `%CUSTOMDOC` and `geometry`, still contains the composer-injected engine core, and still renders the GFM body.

- [ ] **Step 2: Run, fix, pass.**

- [ ] **Step 3: Commit**
```bash
git add packages/druckform/tests/fixtures/templates/customdoc packages/druckform/tests/integration/document-override.test.ts
git commit -m "test(druckform): document shell override integration (TS)"
```

---

## Final verification

- [ ] **Run both suites, typechecks, builds**
```bash
pnpm --filter druckform exec vitest run
pnpm --filter druckform-mcp exec vitest run
pnpm --filter druckform typecheck && pnpm --filter druckform-mcp typecheck
pnpm --filter druckform build && pnpm --filter druckform-mcp build
```

- [ ] **(Optional) Real PDF smoke test** — `druck render -t base --in <kitchensink> --out /tmp/out.pdf` to confirm the inverted shell compiles end-to-end under tectonic.

- [ ] **Add a changeset** — `.changeset/extensibility-phase-2.md` (`druckform` minor): templates declare style merged down the extends chain (external `--style` now an optional override); the document LaTeX shell is an overrideable `document` component (YAML or TS) with engine-core packages kept composer-injected.

- [ ] **Update docs** — `docs/extending-druckform.md` (style-in-template in §4/§6; the `document` component + `DocumentLayout` + engine-core split in a new subsection of §6/§7), `README.md`, and `claude-plugin/skills/druckform/SKILL.md` as needed.

---

## Self-Review

**Spec coverage (§4):**
- §4.1 style-in-template + merge down chain + external override → Tasks A1–A3.
- §4.2.2 `DocumentLayout` payload → B1.
- §4.2.3/4.2.4 declarative + TS overrides → B2 (TS default), B4 (declarative), B5 (override e2e).
- §4.2.5 composer inversion + source-map preservation → B3 (with the marker approach; source-map test mandatory).
- §4.2.6 engine-core split → B3 (composer emits documentclass + engine core; `xcolor` included).

**Refinement flagged:** the document component does not emit `\documentclass`/engine packages (forced by LaTeX ordering + decision B); it chooses the `documentclass` value via the payload. Documented in "Design notes".

**Backward compatibility:** render 4th arg widens to `BlockElement | DocumentLayout` (additive); existing components ignore it. `--style` becomes optional but explicit styles still work (merged over the template baseline). `base` gains a `document` component + a baseline `style`. The MCP `render_document` `style` arg is unchanged in Phase 2 (optional-style on the MCP surface is Phase 4 with `render_markdown`).

**Risks:** source-map alignment (mitigated by the dedicated B3 test); a template that overrides `document` but omits the body marker (composer throws a clear error); `style_defaults` removal (field is currently dead — no reader downstream).
