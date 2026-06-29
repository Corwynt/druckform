# GFM Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render full GitHub Flavored Markdown to LaTeX, with block-level elements implemented as overrideable template components.

**Architecture:** Parse each text node with `markdown-it` (`html:false`, `linkify:true`), then walk its token stream in a new emitter. Inline marks are emitted directly; block-level elements (table, code block, blockquote, heading, list, hr, image) are dispatched to built-in components shipped in the `base` template under a reserved `block:` namespace, so any template in the extension chain can override them. The component render contract gains an optional typed `BlockElement` payload.

**Tech Stack:** TypeScript (ESM), `markdown-it`, `zod`, `vitest`, `tsup`, pnpm workspace.

## Global Constraints

- Node.js ≥ 22; package manager pnpm; tests via `vitest`.
- The renderer disables shell-escape (`--untrusted`); `minted` is forbidden.
- All literal Markdown text must pass through `escapeTeX` (from `src/sdk/tex.ts`).
- Image refs must pass through `resolveAssetPath` (from `src/sdk/asset-path.ts`).
- Built-in element component names use the reserved prefix `block:` (`block:table`, `block:codeblock`, `block:blockquote`, `block:heading`, `block:list`, `block:hr`, `block:image`). User templates may override these names but may not introduce other `block:`-prefixed components.
- Existing tests must keep passing. The `mdToLatex` signature change is internal — only `composer.ts` calls it.
- Run all commands from the repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- Commit after each task with the `git add` of exactly the files that task touched.

**Deviation from spec (intentional):** The spec named `markdown-it-task-lists`. We do **not** use it — it injects raw HTML `<input>` tokens, which conflict with `html:false`. Task items (`- [ ]` / `- [x]`) are detected in the emitter and rendered by `block:list`. This keeps task styling inside the overrideable component.

---

### Task 1: Dependency, `BlockElement` type, and contract extension

**Files:**
- Modify: `packages/druckform/package.json` (add `markdown-it` dependency)
- Modify: `packages/druckform/src/sdk/types.ts` (add `BlockElement`; extend render signatures)
- Modify: `packages/druckform/src/sdk/index.ts` — note: actual path is `packages/druckform/src/index.ts` (export `BlockElement`)
- Modify: `packages/druckform/src/component/typescript.ts` (thread `element` arg)
- Modify: `packages/druckform/src/component/declarative.ts` (accept-and-ignore `element` arg)
- Test: `packages/druckform/tests/unit/component-element-payload.test.ts`
- Test fixture: `packages/druckform/tests/fixtures/components/echo-hr.ts`

**Interfaces:**
- Produces: `BlockElement` (discriminated union, below); `ComponentDef.render: (params: unknown, children: string, ctx: RenderCtx, element?: BlockElement) => string`; `Component<T>` gains optional 4th param `element?: BlockElement`.

- [ ] **Step 1: Add the dependency**

Run:
```bash
pnpm --filter druckform add markdown-it@^14.1.0
```
Expected: `package.json` gains `"markdown-it": "^14.1.0"` under `dependencies`; lockfile updates. (markdown-it v14 ships its own TypeScript types — no `@types` package needed.)

- [ ] **Step 2: Add the `BlockElement` type and extend the render contract**

In `packages/druckform/src/sdk/types.ts`, add this block in the `── Components ──` section (just above `export type Component`):

```ts
// Typed payload for built-in block-level element components. Supplied by the
// Markdown emitter; user components leave the 4th render arg undefined.
export type BlockElement =
  | {
      kind: "table";
      alignments: Array<"left" | "center" | "right" | null>;
      header: string[]; // each cell is pre-rendered inline LaTeX
      rows: string[][]; // each cell is pre-rendered inline LaTeX
    }
  | { kind: "codeblock"; language: string | null; code: string }
  | {
      kind: "list";
      ordered: boolean;
      start: number | null;
      items: Array<{ content: string; task: "checked" | "unchecked" | null }>;
    }
  | { kind: "heading"; level: number } // content via `children`
  | { kind: "blockquote" } // content via `children`
  | { kind: "image"; src: string; alt: string; title: string | null } // src = resolved path
  | { kind: "hr" };
```

Then change the `Component` type to:

```ts
export type Component<TSchema extends ZodObject<ZodRawShape>> = (
  params: TSchema["_output"],
  children: string,
  ctx: RenderCtx,
  element?: BlockElement,
) => string;
```

And in `ComponentDef`, change the `render` field to:

```ts
  render: (params: unknown, children: string, ctx: RenderCtx, element?: BlockElement) => string;
```

- [ ] **Step 3: Export `BlockElement` from the package entry**

In `packages/druckform/src/index.ts`, add `BlockElement` to the `export type { ... } from "./sdk/types.js";` list (after `Component`):

```ts
export type {
  Finding,
  RenderCtx,
  Component,
  BlockElement,
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

- [ ] **Step 4: Thread `element` through the TypeScript loader**

In `packages/druckform/src/component/typescript.ts`, update the imported module's `render` type and the wrapper:

Change the `mod` type's render line to:
```ts
      render: (params: unknown, children: string, ctx: unknown, element?: unknown) => string;
```
Change the returned `render` wrapper to:
```ts
      render: (params, children, ctx, element) => {
        const validated = mod.schema.parse(params);
        return mod.render(validated, children, ctx, element);
      },
```

- [ ] **Step 5: Accept-and-ignore `element` in the declarative loader**

In `packages/druckform/src/component/declarative.ts`, change the render function signature so its type matches the contract (the param is unused — declarative YAML components never receive a payload):

```ts
  const render = (
    params: unknown,
    children: string,
    ctx: RenderCtx,
    _element?: import("../sdk/types.js").BlockElement,
  ): string => {
```

- [ ] **Step 6: Write the failing test**

Create `packages/druckform/tests/fixtures/components/echo-hr.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "echo-hr", description: "test", acceptsChildren: false };
export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  return element ? `KIND:${element.kind}` : "NO-ELEMENT";
}
```

Create `packages/druckform/tests/unit/component-element-payload.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures/components/echo-hr.ts");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };

describe("component render receives BlockElement payload", () => {
  it("passes the element through to a TS component", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.render({}, "", ctx, { kind: "hr" })).toBe("KIND:hr");
  });

  it("leaves element undefined for ordinary calls", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.render({}, "", ctx)).toBe("NO-ELEMENT");
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/component-element-payload.test.ts
```
Expected: FAIL before Steps 2–5 are in place (type error / `element` undefined). After Steps 2–5 it should be implemented; if you are doing strict TDD, temporarily revert Step 4's wrapper to confirm the failure, then restore.

- [ ] **Step 8: Run the test and the type-check to verify they pass**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/component-element-payload.test.ts
pnpm --filter druckform typecheck
```
Expected: test PASS; `tsc --noEmit` clean.

- [ ] **Step 9: Commit**

```bash
git add packages/druckform/package.json packages/druckform/src/sdk/types.ts packages/druckform/src/index.ts packages/druckform/src/component/typescript.ts packages/druckform/src/component/declarative.ts packages/druckform/tests/unit/component-element-payload.test.ts packages/druckform/tests/fixtures/components/echo-hr.ts pnpm-lock.yaml
git commit -m "feat(druckform): add BlockElement payload to component render contract"
```

---

### Task 2: Simple block components (heading, blockquote, hr, image, codeblock)

**Files:**
- Create: `packages/druckform/templates/base/components/block-heading.ts`
- Create: `packages/druckform/templates/base/components/block-blockquote.ts`
- Create: `packages/druckform/templates/base/components/block-hr.ts`
- Create: `packages/druckform/templates/base/components/block-image.ts`
- Create: `packages/druckform/templates/base/components/block-codeblock.ts`
- Modify: `packages/druckform/templates/base/template.yaml` (register the five)
- Test: `packages/druckform/tests/unit/block-components-simple.test.ts`

**Interfaces:**
- Consumes: `BlockElement`, `RenderCtx` from `druckform` (Task 1).
- Produces: five `ComponentDef`s named `block:heading`, `block:blockquote`, `block:hr`, `block:image`, `block:codeblock`. Each exports `schema = z.object({})`, `meta`, `render(_p,_c,_ctx,element)`, and (where noted) `preamble`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/block-components-simple.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { BlockElement } from "../../src/sdk/types.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/base/components");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };
const load = (f: string) => loadComponent(path.join(DIR, f), "");
const el = (e: BlockElement) => e;

describe("simple block components", () => {
  it("heading maps levels 1..6 to section..subparagraph", async () => {
    const def = await load("block-heading.ts");
    expect(def.render({}, "Title", ctx, el({ kind: "heading", level: 1 }))).toBe("\\section{Title}");
    expect(def.render({}, "T", ctx, el({ kind: "heading", level: 3 }))).toBe("\\subsubsection{T}");
    expect(def.render({}, "T", ctx, el({ kind: "heading", level: 6 }))).toBe("\\subparagraph{T}");
  });

  it("blockquote wraps children in quote", async () => {
    const def = await load("block-blockquote.ts");
    expect(def.render({}, "Quoted text", ctx, el({ kind: "blockquote" }))).toBe(
      "\\begin{quote}\nQuoted text\n\\end{quote}",
    );
  });

  it("hr emits a rule", async () => {
    const def = await load("block-hr.ts");
    expect(def.render({}, "", ctx, el({ kind: "hr" }))).toBe("\\noindent\\rule{\\linewidth}{0.4pt}");
  });

  it("image emits includegraphics with the resolved src", async () => {
    const def = await load("block-image.ts");
    expect(
      def.render({}, "", ctx, el({ kind: "image", src: "/abs/pic.png", alt: "x", title: null })),
    ).toBe("\\includegraphics[max width=\\linewidth]{/abs/pic.png}");
  });

  it("codeblock emits lstlisting with raw code", async () => {
    const def = await load("block-codeblock.ts");
    const out = def.render({}, "", ctx, el({ kind: "codeblock", language: "ts", code: "a & b" }));
    expect(out).toBe("\\begin{lstlisting}\na & b\n\\end{lstlisting}");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/block-components-simple.test.ts
```
Expected: FAIL — `Unknown component file extension` / file not found.

- [ ] **Step 3: Create `block-heading.ts`**

`packages/druckform/templates/base/components/block-heading.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:heading", description: "Markdown heading", acceptsChildren: true };

const CMDS = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];

export function render(
  _params: unknown,
  children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "heading") return children;
  const cmd = CMDS[element.level - 1] ?? "paragraph";
  return `\\${cmd}{${children}}`;
}
```

- [ ] **Step 4: Create `block-blockquote.ts`**

`packages/druckform/templates/base/components/block-blockquote.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:blockquote", description: "Markdown blockquote", acceptsChildren: true };

export function render(
  _params: unknown,
  children: string,
  _ctx: RenderCtx,
  _element?: BlockElement,
): string {
  return `\\begin{quote}\n${children}\n\\end{quote}`;
}
```

- [ ] **Step 5: Create `block-hr.ts`**

`packages/druckform/templates/base/components/block-hr.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:hr", description: "Horizontal rule", acceptsChildren: false };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  _element?: BlockElement,
): string {
  return "\\noindent\\rule{\\linewidth}{0.4pt}";
}
```

- [ ] **Step 6: Create `block-image.ts`**

`packages/druckform/templates/base/components/block-image.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:image", description: "Markdown image", acceptsChildren: false };
export const preamble = "\\usepackage[export]{adjustbox}"; // provides "max width=" key

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "image") return "";
  return `\\includegraphics[max width=\\linewidth]{${element.src}}`;
}
```

- [ ] **Step 7: Create `block-codeblock.ts`**

`packages/druckform/templates/base/components/block-codeblock.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:codeblock", description: "Fenced code block", acceptsChildren: false };
export const preamble = [
  "\\usepackage{listings}",
  "\\lstset{basicstyle=\\ttfamily\\small,breaklines=true,columns=fullflexible,frame=single}",
].join("\n");

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "codeblock") return "";
  return `\\begin{lstlisting}\n${element.code}\n\\end{lstlisting}`;
}
```

- [ ] **Step 8: Register the components in the base template**

Edit `packages/druckform/templates/base/template.yaml` so the `components:` map includes the new entries (keep the existing `infobox`):
```yaml
name: base
description: "Base template — foundational components for all documents."
components:
  infobox:
    source: components/infobox.component.yaml
  "block:heading":
    source: components/block-heading.ts
  "block:blockquote":
    source: components/block-blockquote.ts
  "block:hr":
    source: components/block-hr.ts
  "block:image":
    source: components/block-image.ts
  "block:codeblock":
    source: components/block-codeblock.ts
```

- [ ] **Step 9: Run the test to verify it passes**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/block-components-simple.test.ts
```
Expected: PASS (all 5 cases).

- [ ] **Step 10: Commit**

```bash
git add packages/druckform/templates/base/components/block-heading.ts packages/druckform/templates/base/components/block-blockquote.ts packages/druckform/templates/base/components/block-hr.ts packages/druckform/templates/base/components/block-image.ts packages/druckform/templates/base/components/block-codeblock.ts packages/druckform/templates/base/template.yaml packages/druckform/tests/unit/block-components-simple.test.ts
git commit -m "feat(druckform): add simple block element components (heading, blockquote, hr, image, codeblock)"
```

---

### Task 3: Structured block components (table, list)

**Files:**
- Create: `packages/druckform/templates/base/components/block-table.ts`
- Create: `packages/druckform/templates/base/components/block-list.ts`
- Modify: `packages/druckform/templates/base/template.yaml` (register the two)
- Test: `packages/druckform/tests/unit/block-components-structured.test.ts`

**Interfaces:**
- Consumes: `BlockElement` table/list variants (Task 1).
- Produces: `ComponentDef`s named `block:table`, `block:list`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/block-components-structured.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { BlockElement } from "../../src/sdk/types.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/base/components");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };
const load = (f: string) => loadComponent(path.join(DIR, f), "");
const el = (e: BlockElement) => e;

describe("structured block components", () => {
  it("table builds tabularx with alignment, bold header, and booktabs rules", async () => {
    const def = await load("block-table.ts");
    const out = def.render({}, "", ctx, el({
      kind: "table",
      alignments: ["left", "center"],
      header: ["A", "B"],
      rows: [["1", "2"], ["3", "4"]],
    }));
    expect(out).toBe(
      [
        "\\begin{tabularx}{\\linewidth}{>{\\raggedright\\arraybackslash}X>{\\centering\\arraybackslash}X}",
        "\\toprule",
        "\\textbf{A} & \\textbf{B} \\\\",
        "\\midrule",
        "1 & 2 \\\\",
        "3 & 4 \\\\",
        "\\bottomrule",
        "\\end{tabularx}",
      ].join("\n"),
    );
  });

  it("unordered list emits itemize", async () => {
    const def = await load("block-list.ts");
    const out = def.render({}, "", ctx, el({
      kind: "list",
      ordered: false,
      start: null,
      items: [{ content: "one", task: null }, { content: "two", task: null }],
    }));
    expect(out).toBe("\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}");
  });

  it("ordered list emits enumerate", async () => {
    const def = await load("block-list.ts");
    const out = def.render({}, "", ctx, el({
      kind: "list",
      ordered: true,
      start: null,
      items: [{ content: "one", task: null }],
    }));
    expect(out).toBe("\\begin{enumerate}\n\\item one\n\\end{enumerate}");
  });

  it("task list items render checkbox symbols", async () => {
    const def = await load("block-list.ts");
    const out = def.render({}, "", ctx, el({
      kind: "list",
      ordered: false,
      start: null,
      items: [
        { content: "done", task: "checked" },
        { content: "todo", task: "unchecked" },
      ],
    }));
    expect(out).toBe(
      "\\begin{itemize}\n\\item[$\\boxtimes$] done\n\\item[$\\square$] todo\n\\end{itemize}",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/block-components-structured.test.ts
```
Expected: FAIL — files not found.

- [ ] **Step 3: Create `block-table.ts`**

`packages/druckform/templates/base/components/block-table.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:table", description: "Markdown table", acceptsChildren: false };
export const preamble = ["\\usepackage{tabularx}", "\\usepackage{booktabs}", "\\usepackage{array}"].join("\n");

function colType(align: "left" | "center" | "right" | null): string {
  if (align === "center") return ">{\\centering\\arraybackslash}X";
  if (align === "right") return ">{\\raggedleft\\arraybackslash}X";
  return ">{\\raggedright\\arraybackslash}X";
}

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments.map(colType).join("");
  const header = `${element.header.map((c) => `\\textbf{${c}}`).join(" & ")} \\\\`;
  const body = element.rows.map((r) => `${r.join(" & ")} \\\\`).join("\n");
  return [
    `\\begin{tabularx}{\\linewidth}{${cols}}`,
    "\\toprule",
    header,
    "\\midrule",
    body,
    "\\bottomrule",
    "\\end{tabularx}",
  ].join("\n");
}
```

- [ ] **Step 4: Create `block-list.ts`**

`packages/druckform/templates/base/components/block-list.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:list", description: "Markdown list", acceptsChildren: false };
export const preamble = "\\usepackage{amssymb}"; // $\square$ / $\boxtimes$

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "list") return "";
  const env = element.ordered ? "enumerate" : "itemize";
  const lines = element.items.map((it) => {
    if (it.task === "checked") return `\\item[$\\boxtimes$] ${it.content}`;
    if (it.task === "unchecked") return `\\item[$\\square$] ${it.content}`;
    return `\\item ${it.content}`;
  });
  return `\\begin{${env}}\n${lines.join("\n")}\n\\end{${env}}`;
}
```

- [ ] **Step 5: Register the components**

Add to the `components:` map in `packages/druckform/templates/base/template.yaml`:
```yaml
  "block:table":
    source: components/block-table.ts
  "block:list":
    source: components/block-list.ts
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/block-components-structured.test.ts
```
Expected: PASS (all 4 cases).

- [ ] **Step 7: Commit**

```bash
git add packages/druckform/templates/base/components/block-table.ts packages/druckform/templates/base/components/block-list.ts packages/druckform/templates/base/template.yaml packages/druckform/tests/unit/block-components-structured.test.ts
git commit -m "feat(druckform): add structured block element components (table, list)"
```

---

### Task 4: The emitter — `tokens-to-latex.ts` and the new `mdToLatex`

**Files:**
- Create: `packages/druckform/src/latex/tokens-to-latex.ts`
- Rewrite: `packages/druckform/src/latex/md-to-latex.ts`
- Test: `packages/druckform/tests/unit/tokens-to-latex.test.ts`

**Interfaces:**
- Consumes: `ResolvedTemplate`, `RenderCtx`, `BlockElement` (Task 1); the `block:*` components (Tasks 2–3).
- Produces:
  - `tokensToLatex(tokens: Token[], opts: EmitOpts): string`
  - `interface EmitOpts { template: ResolvedTemplate; ctx: RenderCtx; assetsRoot: string }`
  - `mdToLatex(src: string, opts: EmitOpts): string` (replaces the old single-arg signature)

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/tokens-to-latex.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { mdToLatex } from "../../src/latex/md-to-latex.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import type { EmitOpts } from "../../src/latex/tokens-to-latex.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };
let opts: EmitOpts;

beforeAll(async () => {
  const all = loadAllTemplates(BUNDLED);
  const template = await resolveTemplate("base", all);
  opts = { template, ctx, assetsRoot: "/assets" };
});

describe("mdToLatex (GFM)", () => {
  it("escapes plain inline text and bold/italic/code", () => {
    expect(mdToLatex("a **b** *c* `d&e`", opts)).toContain(
      "a \\textbf{b} \\textit{c} \\texttt{d\\&e}",
    );
  });

  it("renders a heading via block:heading", () => {
    expect(mdToLatex("# Title", opts)).toContain("\\section{Title}");
  });

  it("renders an unordered list via block:list", () => {
    expect(mdToLatex("- one\n- two", opts)).toContain(
      "\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}",
    );
  });

  it("renders an ordered list", () => {
    expect(mdToLatex("1. one\n2. two", opts)).toContain("\\begin{enumerate}");
  });

  it("renders a task list with checkboxes", () => {
    expect(mdToLatex("- [x] done\n- [ ] todo", opts)).toContain(
      "\\item[$\\boxtimes$] done\n\\item[$\\square$] todo",
    );
  });

  it("renders a GFM table with alignment", () => {
    const out = mdToLatex("| A | B |\n|:--|--:|\n| 1 | 2 |", opts);
    expect(out).toContain("\\begin{tabularx}{\\linewidth}{>{\\raggedright\\arraybackslash}X>{\\raggedleft\\arraybackslash}X}");
    expect(out).toContain("\\textbf{A} & \\textbf{B} \\\\");
    expect(out).toContain("1 & 2 \\\\");
  });

  it("renders a blockquote", () => {
    expect(mdToLatex("> quoted", opts)).toContain("\\begin{quote}");
  });

  it("renders a fenced code block verbatim (no escaping of body)", () => {
    expect(mdToLatex("```\na & b\n```", opts)).toContain(
      "\\begin{lstlisting}\na & b\n\\end{lstlisting}",
    );
  });

  it("renders a link with hyperref", () => {
    expect(mdToLatex("[text](https://x.com)", opts)).toContain("\\href{https://x.com}{text}");
  });

  it("renders strikethrough", () => {
    expect(mdToLatex("~~gone~~", opts)).toContain("\\sout{gone}");
  });

  it("renders a horizontal rule", () => {
    expect(mdToLatex("---", opts)).toContain("\\noindent\\rule{\\linewidth}{0.4pt}");
  });

  it("resolves image paths against the assets root", () => {
    expect(mdToLatex("![alt](pic.png)", opts)).toContain(
      "\\includegraphics[max width=\\linewidth]{/assets/pic.png}",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/tokens-to-latex.test.ts
```
Expected: FAIL — `tokens-to-latex.js` not found / `mdToLatex` arity mismatch.

- [ ] **Step 3: Create the emitter `tokens-to-latex.ts`**

`packages/druckform/src/latex/tokens-to-latex.ts`:
```ts
import MarkdownIt from "markdown-it";
import { resolveAssetPath } from "../sdk/asset-path.js";
import { escapeTeX } from "../sdk/tex.js";
import type { BlockElement, RenderCtx, ResolvedTemplate } from "../sdk/types.js";

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

export interface EmitOpts {
  template: ResolvedTemplate;
  ctx: RenderCtx;
  assetsRoot: string;
}

const ALIGN: Record<string, "left" | "center" | "right"> = {
  "text-align:left": "left",
  "text-align:center": "center",
  "text-align:right": "right",
};

// Escape characters that break hyperref's \href first argument.
function escapeUrl(url: string): string {
  return url.replace(/[\\{}%#&]/g, (c) => `\\${c}`);
}

export function tokensToLatex(tokens: Token[], opts: EmitOpts): string {
  return renderBlocks(tokens, 0, tokens.length, opts).trim();
}

function block(opts: EmitOpts, name: string, children: string, element: BlockElement): string {
  const entry = opts.template.components[name];
  if (!entry) {
    throw new Error(
      `Template '${opts.template.name}' is missing built-in component '${name}'. ` +
        `Templates must extend 'base'.`,
    );
  }
  return entry.def.render({}, children, opts.ctx, element);
}

// Index of the token whose nesting closes the container opened at `start`.
function matchClose(tokens: Token[], start: number): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    depth += tokens[i]?.nesting ?? 0;
    if (depth === 0) return i;
  }
  throw new Error("unbalanced markdown-it token stream");
}

function renderBlocks(tokens: Token[], start: number, end: number, opts: EmitOpts): string {
  const out: string[] = [];
  let i = start;
  while (i < end) {
    const t = tokens[i];
    if (!t) break;
    switch (t.type) {
      case "paragraph_open": {
        out.push(renderInline(tokens[i + 1], opts));
        i += 3; // open, inline, close
        break;
      }
      case "heading_open": {
        const level = Number(t.tag.slice(1));
        const children = renderInline(tokens[i + 1], opts);
        out.push(block(opts, "block:heading", children, { kind: "heading", level }));
        i += 3;
        break;
      }
      case "hr": {
        out.push(block(opts, "block:hr", "", { kind: "hr" }));
        i += 1;
        break;
      }
      case "blockquote_open": {
        const close = matchClose(tokens, i);
        const inner = renderBlocks(tokens, i + 1, close, opts);
        out.push(block(opts, "block:blockquote", inner, { kind: "blockquote" }));
        i = close + 1;
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        const close = matchClose(tokens, i);
        const ordered = t.type === "ordered_list_open";
        const startAttr = t.attrGet?.("start");
        const items: BlockElement extends { kind: "list" } ? never : Array<{
          content: string;
          task: "checked" | "unchecked" | null;
        }> = [];
        let j = i + 1;
        while (j < close) {
          if (tokens[j]?.type === "list_item_open") {
            const itemClose = matchClose(tokens, j);
            let content = renderBlocks(tokens, j + 1, itemClose, opts).trim();
            let task: "checked" | "unchecked" | null = null;
            const m = /^\[([ xX])\]\s+/.exec(content);
            if (m) {
              task = m[1] === " " ? "unchecked" : "checked";
              content = content.slice(m[0].length);
            }
            items.push({ content, task });
            j = itemClose + 1;
          } else {
            j++;
          }
        }
        out.push(
          block(opts, "block:list", "", {
            kind: "list",
            ordered,
            start: startAttr ? Number(startAttr) : null,
            items,
          }),
        );
        i = close + 1;
        break;
      }
      case "table_open": {
        const close = matchClose(tokens, i);
        out.push(renderTable(tokens, i, close, opts));
        i = close + 1;
        break;
      }
      case "fence":
      case "code_block": {
        const info = t.info?.trim().split(/\s+/)[0] || null;
        out.push(
          block(opts, "block:codeblock", "", {
            kind: "codeblock",
            language: info,
            code: t.content.replace(/\n$/, ""),
          }),
        );
        i += 1;
        break;
      }
      case "html_block": {
        out.push(escapeTeX(t.content));
        i += 1;
        break;
      }
      default:
        i += 1;
    }
  }
  return out.join("\n\n");
}

function renderTable(tokens: Token[], open: number, close: number, opts: EmitOpts): string {
  const alignments: Array<"left" | "center" | "right" | null> = [];
  const header: string[] = [];
  const rows: string[][] = [];
  let inHead = false;
  let current: string[] | null = null;

  for (let i = open + 1; i < close; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open") current = [];
    else if (t.type === "tr_close") {
      if (current) {
        if (inHead) header.push(...current);
        else rows.push(current);
      }
      current = null;
    } else if (t.type === "th_open" || t.type === "td_open") {
      const cell = renderInline(tokens[i + 1], opts);
      current?.push(cell);
      if (inHead) {
        const style = t.attrGet?.("style") ?? "";
        alignments.push(ALIGN[style] ?? null);
      }
      i += 1; // skip the inline token we just consumed
    }
  }
  return block(opts, "block:table", "", { kind: "table", alignments, header, rows });
}

function renderInline(token: Token | undefined, opts: EmitOpts): string {
  if (!token || !token.children) return token ? escapeTeX(token.content) : "";
  let out = "";
  for (const c of token.children) {
    switch (c.type) {
      case "text":
        out += escapeTeX(c.content);
        break;
      case "softbreak":
        out += " ";
        break;
      case "hardbreak":
        out += "\\\\\n";
        break;
      case "code_inline":
        out += `\\texttt{${escapeTeX(c.content)}}`;
        break;
      case "strong_open":
        out += "\\textbf{";
        break;
      case "strong_close":
        out += "}";
        break;
      case "em_open":
        out += "\\textit{";
        break;
      case "em_close":
        out += "}";
        break;
      case "s_open":
        out += "\\sout{";
        break;
      case "s_close":
        out += "}";
        break;
      case "link_open":
        out += `\\href{${escapeUrl(c.attrGet?.("href") ?? "")}}{`;
        break;
      case "link_close":
        out += "}";
        break;
      case "image": {
        const ref = c.attrGet?.("src") ?? "";
        let src = ref;
        try {
          src = resolveAssetPath(opts.assetsRoot, ref);
        } catch {
          src = ref;
        }
        out += block(opts, "block:image", "", {
          kind: "image",
          src,
          alt: c.content,
          title: c.attrGet?.("title") || null,
        });
        break;
      }
      case "html_inline":
        out += escapeTeX(c.content);
        break;
      default:
        break;
    }
  }
  return out;
}
```

Note: if `tsc` rejects the conditional-type annotation on `items`, replace that declaration with the plain form:
```ts
const items: Array<{ content: string; task: "checked" | "unchecked" | null }> = [];
```
(The plain form is correct; use it directly.)

- [ ] **Step 4: Rewrite `md-to-latex.ts` to use the emitter**

Replace the entire contents of `packages/druckform/src/latex/md-to-latex.ts` with:
```ts
import MarkdownIt from "markdown-it";
import { type EmitOpts, tokensToLatex } from "./tokens-to-latex.js";

const md = new MarkdownIt({ html: false, linkify: true });

/**
 * Convert a Markdown text node to LaTeX. Inline marks are emitted directly;
 * block-level elements are dispatched to the active template's `block:*`
 * components so they can be overridden through the template extension chain.
 */
export function mdToLatex(src: string, opts: EmitOpts): string {
  return tokensToLatex(md.parse(src, {}), opts);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/tokens-to-latex.test.ts
pnpm --filter druckform typecheck
```
Expected: all cases PASS; `tsc` clean. (If typecheck flags the `items` annotation, apply the plain-form replacement from Step 3's note.)

- [ ] **Step 6: Commit**

```bash
git add packages/druckform/src/latex/tokens-to-latex.ts packages/druckform/src/latex/md-to-latex.ts packages/druckform/tests/unit/tokens-to-latex.test.ts
git commit -m "feat(druckform): GFM emitter over markdown-it, dispatching block elements to template components"
```

---

### Task 5: Wire the emitter into the composer

**Files:**
- Modify: `packages/druckform/src/latex/composer.ts` (pass `template`/`ctx`/`assetsRoot`; add inline-mark packages)
- Modify: `packages/druckform/src/commands/render.ts` (thread the assets dir into `composeDocument`)
- Test: `packages/druckform/tests/unit/composer-gfm.test.ts`

**Interfaces:**
- Consumes: `mdToLatex(src, { template, ctx, assetsRoot })` (Task 4).
- Produces: `composeDocument(doc, template, styleConfig, diagramMap, assetsRoot)` — new 5th parameter `assetsRoot: string`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/composer-gfm.test.ts`:
```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
});

describe("composer GFM integration", () => {
  it("emits a table and pulls in tabularx/booktabs/hyperref/ulem packages", () => {
    const doc = parseMarkdownString("| A | B |\n|--|--|\n| 1 | 2 |\n\nSee [link](https://x.com).");
    const { tex } = composeDocument(doc, template, style, new Map(), "/assets");
    expect(tex).toContain("\\begin{tabularx}");
    expect(tex).toContain("\\usepackage{tabularx}");
    expect(tex).toContain("\\usepackage{booktabs}");
    expect(tex).toContain("\\usepackage{hyperref}");
    expect(tex).toContain("\\usepackage[normalem]{ulem}");
    expect(tex).toContain("\\href{https://x.com}{link}");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/composer-gfm.test.ts
```
Expected: FAIL — `composeDocument` arity / missing packages / `mdToLatex` call mismatch.

- [ ] **Step 3: Update `composeDocument` signature and the `mdToLatex` call**

In `packages/druckform/src/latex/composer.ts`:

Change the function signature to add `assetsRoot`:
```ts
export function composeDocument(
  doc: ParsedDocument,
  template: ResolvedTemplate,
  styleConfig: StyleConfig,
  diagramMap: Map<string, string>, // fence text → pdf path
  assetsRoot: string,
): ComposeResult {
```

In `renderNode`, change the `mdToLatex` call (currently `let latex = mdToLatex(text);`) to:
```ts
      let latex = mdToLatex(text, { template, ctx, assetsRoot });
```

- [ ] **Step 4: Add inline-mark packages to the base preamble**

In `packages/druckform/src/latex/composer.ts`, update the `texParts` array header (currently `\documentclass`, `fontspec`, `xcolor`, `graphicx`, `stylePreamble`) to include `hyperref` and `ulem`:
```ts
  const texParts = [
    "\\documentclass{article}",
    "\\usepackage{fontspec}",
    "\\usepackage{xcolor}",
    "\\usepackage{graphicx}",
    "\\usepackage{hyperref}",
    "\\usepackage[normalem]{ulem}",
    stylePreamble,
  ];
```

Also update the `PREAMBLE_LINES` base offset to account for the two added `\usepackage` lines: change the `+ 5` constant in the `PREAMBLE_LINES` calculation to `+ 7`:
```ts
  const PREAMBLE_LINES = stylePreamble.split("\n").length + 7 + componentPreambleLines;
```
(The header now has 7 fixed lines before the style preamble: documentclass + 5 usepackage + the eventual `\begin{document}` accounting as before. This keeps the source map aligned.)

- [ ] **Step 5: Thread the assets dir through the render command**

In `packages/druckform/src/commands/render.ts`:
- Rename the unused `_assetsDir` parameter of `renderCommand` to `assetsDir`.
- Find the `composeDocument(...)` call and add `assetsDir` as the 5th argument:
```ts
    const { tex, sourceMap } = composeDocument(doc, resolved, styleConfig, diagramMap, assetsDir);
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/composer-gfm.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS; `tsc` clean.

- [ ] **Step 7: Run the full unit+integration suite to catch regressions**

Run:
```bash
pnpm --filter druckform exec vitest run
```
Expected: all tests PASS (including the pre-existing `integration/render.test.ts`, which mocks tectonic).

- [ ] **Step 8: Commit**

```bash
git add packages/druckform/src/latex/composer.ts packages/druckform/src/commands/render.ts packages/druckform/tests/unit/composer-gfm.test.ts
git commit -m "feat(druckform): wire GFM emitter into composer; add hyperref/ulem to base preamble"
```

---

### Task 6: Reserved `block:` namespace validation

**Files:**
- Modify: `packages/druckform/src/template/loader.ts` (reject unknown `block:` names in user templates)
- Test: `packages/druckform/tests/unit/reserved-namespace.test.ts`

**Interfaces:**
- Consumes: `loadAllTemplates(bundledDir, userDir?)`.
- Produces: a load-time error when a **user-origin** template declares a `block:`-prefixed component that is not one of the seven known built-ins.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/reserved-namespace.test.ts`:
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
let userDir: string | null = null;

afterEach(() => {
  if (userDir) fs.rmSync(userDir, { recursive: true, force: true });
  userDir = null;
});

function writeUserTemplate(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-tpl-"));
  const tdir = path.join(dir, "mytpl");
  fs.mkdirSync(tdir);
  fs.writeFileSync(path.join(tdir, "template.yaml"), yaml, "utf8");
  return dir;
}

describe("reserved block: namespace", () => {
  it("rejects a user template that defines a non-builtin block: component", () => {
    userDir = writeUserTemplate(
      'name: mytpl\nextends: base\ncomponents:\n  "block:fancy":\n    source: x.ts\n',
    );
    expect(() => loadAllTemplates(BUNDLED, userDir!)).toThrow(/reserved 'block:' namespace/);
  });

  it("allows a user template to override a known built-in block component", () => {
    userDir = writeUserTemplate(
      'name: mytpl\nextends: base\ncomponents:\n  "block:table":\n    source: x.ts\n',
    );
    expect(() => loadAllTemplates(BUNDLED, userDir!)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/reserved-namespace.test.ts
```
Expected: FAIL — no error thrown for the first case.

- [ ] **Step 3: Add the validation in the loader**

In `packages/druckform/src/template/loader.ts`, add the known-set constant near the top (after imports):
```ts
const KNOWN_BLOCK_COMPONENTS = new Set([
  "block:heading",
  "block:blockquote",
  "block:hr",
  "block:image",
  "block:codeblock",
  "block:table",
  "block:list",
]);
```

Inside `loadAllTemplates`, after `const config = yaml.load(raw) as TemplateConfig;` and before `templates.set(...)`, add:
```ts
      if (origin === "user") {
        for (const compName of Object.keys(config.components ?? {})) {
          if (compName.startsWith("block:") && !KNOWN_BLOCK_COMPONENTS.has(compName)) {
            throw new Error(
              `Template '${config.name}' uses the reserved 'block:' namespace for unknown ` +
                `component '${compName}'. Only built-in block components may use this prefix.`,
            );
          }
        }
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/reserved-namespace.test.ts
```
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/druckform/src/template/loader.ts packages/druckform/tests/unit/reserved-namespace.test.ts
git commit -m "feat(druckform): reserve block: namespace for built-in element components"
```

---

### Task 7: End-to-end fixtures, override test, and changeset

**Files:**
- Create: `packages/druckform/tests/fixtures/documents/gfm-kitchensink.md`
- Create: `packages/druckform/tests/fixtures/templates/fancy/template.yaml`
- Create: `packages/druckform/tests/fixtures/templates/fancy/components/block-table.ts`
- Test: `packages/druckform/tests/integration/gfm-render.test.ts`
- Create: `.changeset/gfm-markdown-rendering.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.

- [ ] **Step 1: Create the kitchen-sink fixture document**

`packages/druckform/tests/fixtures/documents/gfm-kitchensink.md`:
```markdown
# Heading 1

A paragraph with **bold**, *italic*, `code`, ~~strike~~, and a [link](https://example.com).

## Lists

- one
- two
  - nested

1. first
2. second

- [x] done
- [ ] todo

## Quote

> a blockquote

## Table

| Left | Center | Right |
|:-----|:------:|------:|
| a    | b      | c     |

## Code

```
plain & code
```

---
```

- [ ] **Step 2: Create the override template fixture**

`packages/druckform/tests/fixtures/templates/fancy/template.yaml`:
```yaml
name: fancy
description: "Test template overriding block:table"
extends: base
components:
  "block:table":
    source: components/block-table.ts
```

`packages/druckform/tests/fixtures/templates/fancy/components/block-table.ts`:
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:table", description: "fancy table", acceptsChildren: false };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  return `%FANCYTABLE rows=${element.rows.length}`;
}
```

- [ ] **Step 3: Write the integration + override test**

`packages/druckform/tests/integration/gfm-render.test.ts`:
```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseDocument } from "../../src/parse/parser.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import type { StyleConfig } from "../../src/sdk/types.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
const DOC = path.resolve(import.meta.dirname, "../fixtures/documents/gfm-kitchensink.md");
const style: StyleConfig = {
  $schema: "style-v1",
  tokens: { colors: { accent: "#111111", warning: "#222222" } },
};

describe("GFM kitchen-sink", () => {
  it("renders every element through the base template", async () => {
    const template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
    const { tex } = composeDocument(parseDocument(DOC), template, style, new Map(), USER);
    for (const fragment of [
      "\\section{Heading 1}",
      "\\textbf{bold}",
      "\\textit{italic}",
      "\\texttt{code}",
      "\\sout{strike}",
      "\\href{https://example.com}{link}",
      "\\begin{itemize}",
      "\\begin{enumerate}",
      "\\item[$\\boxtimes$] done",
      "\\item[$\\square$] todo",
      "\\begin{quote}",
      "\\begin{tabularx}",
      "\\begin{lstlisting}",
      "\\noindent\\rule{\\linewidth}{0.4pt}",
    ]) {
      expect(tex).toContain(fragment);
    }
  });

  it("lets a template override block:table through the extension chain", async () => {
    const all = loadAllTemplates(BUNDLED, USER);
    const template = await resolveTemplate("fancy", all);
    const { tex } = composeDocument(parseDocument(DOC), template, style, new Map(), USER);
    expect(tex).toContain("%FANCYTABLE rows=1");
    expect(tex).not.toContain("\\begin{tabularx}");
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter druckform exec vitest run tests/integration/gfm-render.test.ts
```
Expected: PASS (both cases). If the kitchen-sink fixture's fenced code block confuses your editor, ensure the ```` ``` ```` lines inside the `.md` fixture are written literally into the file.

- [ ] **Step 5: Add a changeset**

Create `.changeset/gfm-markdown-rendering.md`:
```markdown
---
"druckform": minor
---

Render full GitHub Flavored Markdown: tables, ordered/nested lists, task lists,
links, autolinks, images, blockquotes, fenced code blocks, strikethrough, and
horizontal rules. Block-level elements are implemented as built-in components in
the `base` template under a reserved `block:` namespace, so templates can
override how any of them render via the existing extension chain.
```

- [ ] **Step 6: Run the full suite and build**

Run:
```bash
pnpm --filter druckform exec vitest run
pnpm --filter druckform build
```
Expected: all tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/druckform/tests/fixtures/documents/gfm-kitchensink.md packages/druckform/tests/fixtures/templates/fancy packages/druckform/tests/integration/gfm-render.test.ts .changeset/gfm-markdown-rendering.md
git commit -m "test(druckform): GFM kitchen-sink + template override integration tests"
```

---

## Self-Review

**Spec coverage:**
- Full GFM element set (§1, §4) → Tasks 2–4, 7 (kitchen-sink asserts each).
- markdown-it, `html:false`, `linkify:true` (§3.1) → Task 4 Step 4.
- Emitter dispatches blocks to components; inline marks fixed (§3.2) → Task 4.
- Built-in element components in base template under `block:` namespace (§4.1) → Tasks 2–3, registered in `template.yaml`.
- Contract extension with typed payload (§4.2) → Task 1.
- Packages via component preambles; inline packages in base preamble; minted excluded (§4.3) → Tasks 2–3 (`preamble`), Task 5 Step 4.
- Escaping/safety via `escapeTeX`, `resolveAssetPath`, `html:false` (§5) → Task 4 emitter.
- Tests: per-element, override, reserved-namespace, kitchen-sink (§6) → Tasks 2–4, 6, 7.
- `--only-cached` already removed (prerequisite, committed before this plan).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows the assertion.

**Type consistency:** `BlockElement` variants defined once (Task 1) and consumed identically in components (Tasks 2–3) and emitter (Task 4). `block:list` payload uses `items: Array<{ content; task }>` consistently across Task 1, Task 3 test/impl, and Task 4 emitter. `composeDocument`'s new `assetsRoot` 5th param is defined in Task 5 and used by all callers (`render.ts`, tests). `mdToLatex(src, opts)` and `EmitOpts` are defined in Task 4 and consumed by Task 5.

**Known deviation from spec:** task lists are detected in the emitter rather than via `markdown-it-task-lists` (documented at the top, rationale: `html:false` incompatibility). The `block:image` default uses `adjustbox`'s `max width` key (graphicx alone lacks it) — declared in that component's `preamble`.
