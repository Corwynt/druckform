# Extensibility Phase 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Documents carry **YAML frontmatter**; templates declare a frontmatter **schema** (validated like component params); frontmatter values are exposed to **all components**; and the **template can be selected from frontmatter**, with an explicit `--template` arg overriding.

**Design source:** `docs/superpowers/specs/2026-06-29-extensibility-roadmap-design.md` §5.

**Tech Stack:** TypeScript (ESM), `js-yaml`, `zod`, `vitest`, `tsup`, pnpm workspace.

## Global Constraints

- Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`. **Commit after each task**, adding exactly the files the task touched.
- Existing tests must keep passing; changes are additive.
- Build `druckform` before any test that loads a TS component importing a *new* package export.

## Scope decisions (stated defaults)

1. **Frontmatter values are `Record<string, string>`.** Scalars are coerced with `String(...)`; non-scalars (objects/arrays) are ignored with no error in Phase 3 (frontmatter is for simple doc metadata: title/author/date/template). This matches the existing `DocumentLayout.frontmatter` / param model (component params are already strings).
2. **`template` is a reserved frontmatter key** used for template selection; it is still passed through in `ctx.frontmatter` (harmless; a component may read it).
3. **Frontmatter delimiter:** only a `---` on the **very first line** with a later closing `---` is frontmatter; otherwise the leading `---` is ordinary content (GFM hr). Source-line numbers of the body are **preserved** (body parses from the line after the closing `---`).
4. **MCP unchanged in Phase 3.** `render_document` still takes an explicit `template`. Frontmatter-driven template selection is a CLI/core concern here; the MCP no-arg path is Phase 4 (`render_markdown`).
5. **Frontmatter schema merges down the `extends` chain** (shallow, per-key; child wins), like style.

---

### Task 1: Parse frontmatter in the parser

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`ParsedDocument.frontmatter`)
- Modify: `packages/druckform/src/parse/parser.ts`
- Test: `packages/druckform/tests/unit/parser-frontmatter.test.ts`

**Interfaces:** `ParsedDocument` gains `frontmatter: Record<string, string>` (always present; `{}` when none).

- [ ] **Step 1: Write the failing test** — `parser-frontmatter.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseMarkdownString } from "../../src/parse/parser.js";

describe("frontmatter parsing", () => {
  it("extracts leading --- frontmatter and keeps the body", () => {
    const doc = parseMarkdownString("---\ntitle: Hello\ntemplate: report\n---\n# Heading\n");
    expect(doc.frontmatter).toEqual({ title: "Hello", template: "report" });
    expect(doc.nodes.some((n) => n.type === "text" && n.content.includes("# Heading"))).toBe(true);
  });

  it("preserves body source-line numbers (body after frontmatter)", () => {
    // frontmatter occupies lines 1-3; the heading is on line 4
    const doc = parseMarkdownString("---\ntitle: X\n---\n# Heading\n");
    const text = doc.nodes.find((n) => n.type === "text");
    expect(text && text.type === "text" ? text.sourceLine : -1).toBe(4);
  });

  it("treats a leading --- with no close as ordinary content (no frontmatter)", () => {
    const doc = parseMarkdownString("---\njust text\nmore");
    expect(doc.frontmatter).toEqual({});
  });

  it("returns empty frontmatter when absent", () => {
    expect(parseMarkdownString("# Heading").frontmatter).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Add `frontmatter` to `ParsedDocument`** in `types.ts`:
```ts
export interface ParsedDocument {
  nodes: ASTNode[];
  frontmatter: Record<string, string>;
}
```

- [ ] **Step 4: Parse frontmatter in `parser.ts`**
- Add `import yaml from "js-yaml";`.
- Add a helper that, given the full `lines`, detects leading frontmatter and returns `{ frontmatter, bodyStartIndex }`:
```ts
function extractFrontmatter(lines: string[]): { frontmatter: Record<string, string>; bodyStart: number } {
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, bodyStart: 0 };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") { close = i; break; }
  }
  if (close < 0) return { frontmatter: {}, bodyStart: 0 }; // no closing fence → not frontmatter
  const raw = lines.slice(1, close).join("\n");
  const parsed = (yaml.load(raw) ?? {}) as Record<string, unknown>;
  const frontmatter: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && typeof v !== "object") frontmatter[k] = String(v);
  }
  return { frontmatter, bodyStart: close + 1 };
}
```
- In both `parseDocument` and `parseMarkdownString`, split lines, call `extractFrontmatter`, then `parseLines(lines, bodyStart)` (so body source lines stay original), and return `{ nodes, frontmatter }`.

- [ ] **Step 5: Run the test + typecheck.** Existing callers of `parseDocument`/`parseMarkdownString` may need `.frontmatter` — it's additive, so they keep working (they read `.nodes`).

- [ ] **Step 6: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/parse/parser.ts packages/druckform/tests/unit/parser-frontmatter.test.ts
git commit -m "feat(druckform): parse leading YAML frontmatter, preserving body source lines"
```

---

### Task 2: Expose frontmatter to components (RenderCtx + DocumentLayout + declarative slots)

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`RenderCtx.frontmatter`)
- Modify: `packages/druckform/src/latex/composer.ts` (build `ctx.frontmatter`; pass into `DocumentLayout.frontmatter`)
- Modify: `packages/druckform/src/component/declarative.ts` (`{{fm.<key>}}` escaped slots)
- Test: `packages/druckform/tests/unit/frontmatter-context.test.ts`

**Interfaces:** `RenderCtx.frontmatter: Record<string, string>`.

- [ ] **Step 1: Write the failing test** — render a doc with frontmatter through `composeDocument`; assert a declarative component using `{{fm.title}}` emits the escaped title, and that `ctx.frontmatter` is populated for a TS component. (Use a fixture template, or assert via a component that echoes `ctx.frontmatter.title`.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Add `frontmatter` to `RenderCtx`** in `types.ts`:
```ts
export interface RenderCtx {
  token(name: string): string;
  style: StyleTokens;
  frontmatter: Record<string, string>;
}
```

- [ ] **Step 4: Build `ctx.frontmatter` in the composer** — compute the effective frontmatter `{ ...schemaDefaults, ...doc.frontmatter }` (schema defaults come from `template.frontmatter`, added in Task 3; until then use `doc.frontmatter` directly). Set `ctx.frontmatter` and pass the same object into the `DocumentLayout.frontmatter` field (replacing the `{}`). `composeDocument` already receives `doc`; read `doc.frontmatter`.

- [ ] **Step 5: Declarative `{{fm.<key>}}` slots** in `declarative.ts` `render` — after param substitution, replace `{{fm.KEY}}` with `escapeTeX(ctx.frontmatter[KEY] ?? "")` for each key present:
```ts
for (const [k, v] of Object.entries(ctx.frontmatter ?? {})) {
  output = output.replaceAll(`{{fm.${k}}}`, escapeTeX(v));
}
```

- [ ] **Step 6: Fix `RenderCtx` literals in tests/helpers** — several tests build a `ctx` literal `{ token, style }`; add `frontmatter: {}` to those, OR make the property optional in the type. **Decision:** make it required in the type and update the test `ctx` literals (search `style: { colors:`), so production code can rely on it. The composer always sets it.

- [ ] **Step 7: Run the test + full suite + typecheck.**

- [ ] **Step 8: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/latex/composer.ts packages/druckform/src/component/declarative.ts packages/druckform/tests/**
git commit -m "feat(druckform): expose document frontmatter to components (ctx.frontmatter + {{fm.*}} slots)"
```

---

### Task 3: Template-declared frontmatter schema + validation

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`TemplateConfig.frontmatter`, `ResolvedTemplate.frontmatter`)
- Modify: `packages/druckform/src/template/resolver.ts` (merge frontmatter schema down chain)
- Create: `packages/druckform/src/parse/frontmatter.ts` (`validateFrontmatter`, `applyFrontmatterDefaults`)
- Modify: `packages/druckform/src/commands/lint.ts` (run frontmatter validation)
- Modify: `packages/druckform/src/latex/composer.ts` (apply schema defaults into effective frontmatter)
- Test: `packages/druckform/tests/unit/frontmatter-schema.test.ts`

**Interfaces:**
- `FrontmatterSpec = Record<string, { type?: "string"; required?: boolean; default?: string }>` on `TemplateConfig.frontmatter` and `ResolvedTemplate.frontmatter`.
- `validateFrontmatter(spec, values): Finding[]` (error per missing required key).
- `applyFrontmatterDefaults(spec, values): Record<string,string>` (`{ ...defaults, ...values }`).

- [ ] **Step 1: Write the failing test** — `validateFrontmatter` returns an error finding when a required key is missing and none when present; `applyFrontmatterDefaults` fills defaults; resolver merges a child's frontmatter schema over the parent's.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Types** — add `frontmatter?: FrontmatterSpec` to `TemplateConfig` and `ResolvedTemplate`; define `FrontmatterSpec` (reuse the `{type,required,default}` shape).

- [ ] **Step 4: Implement `frontmatter.ts`** — `validateFrontmatter` (component name `"frontmatter"` in findings) and `applyFrontmatterDefaults`.

- [ ] **Step 5: Resolver** — accumulate `mergedFrontmatter` down the chain (shallow merge per key, child wins), set `resolved.frontmatter`.

- [ ] **Step 6: Lint** — after component lint, if `resolved.frontmatter`, push `validateFrontmatter(resolved.frontmatter, doc.frontmatter)` findings.

- [ ] **Step 7: Composer** — effective frontmatter = `applyFrontmatterDefaults(template.frontmatter, doc.frontmatter)`; use it for `ctx.frontmatter` and `DocumentLayout.frontmatter`.

- [ ] **Step 8: Run the test + full suite + typecheck.**

- [ ] **Step 9: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/template/resolver.ts packages/druckform/src/parse/frontmatter.ts packages/druckform/src/commands/lint.ts packages/druckform/src/latex/composer.ts packages/druckform/tests/**
git commit -m "feat(druckform): template-declared frontmatter schema with validation and defaults"
```

---

### Task 4: Select the template from frontmatter (arg overrides)

**Files:**
- Modify: `packages/druckform/src/commands/render.ts` (parse doc first; `template = arg ?? frontmatter.template`)
- Modify: `packages/druckform/src/commands/lint.ts` (same)
- Modify: `packages/druckform/src/cli.ts` (render & lint `--template` no longer `demandOption`)
- Test: `packages/druckform/tests/integration/template-from-frontmatter.test.ts`

**Interfaces:** `renderCommand(template: string | undefined, …)`, `lintCommand(template: string | undefined, …)`.

- [ ] **Step 1: Write the failing test** — call `renderCommand(undefined, …)` on a doc whose frontmatter says `template: base`; assert it renders (status ok via mocked tectonic, like `render.test.ts`). Then assert an explicit arg overrides the frontmatter value. Invalid/missing template name → error finding.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Reorder `render.ts`** — `parseDocument(inFile)` first; `const template = templateArg ?? doc.frontmatter.template;` throw a clear error (or emit error contract) if neither; validate the name resolves against `loadAllTemplates`. Then resolve + style + coverage + compose as before.

- [ ] **Step 4: Same reorder in `lint.ts`.**

- [ ] **Step 5: CLI** — make `--template` optional for `render` and `lint` (drop `demandOption: true`); pass `argv.template` (now possibly `undefined`).

- [ ] **Step 6: Run the test + full suite + typecheck.**

- [ ] **Step 7: Commit**
```bash
git add packages/druckform/src/commands/render.ts packages/druckform/src/commands/lint.ts packages/druckform/src/cli.ts packages/druckform/tests/integration/template-from-frontmatter.test.ts
git commit -m "feat(druckform): select template from frontmatter; explicit --template overrides"
```

---

### Task 5: Docs + changeset

- [ ] **Step 1:** `.changeset/extensibility-phase-3.md` (`druckform` minor): frontmatter parsing; template-declared frontmatter schema + validation; `ctx.frontmatter` + `{{fm.*}}` slots; template selectable from frontmatter with `--template` overriding.
- [ ] **Step 2:** Update `docs/extending-druckform.md` — a new "Frontmatter" section (document format §3): syntax, template `frontmatter:` schema, `ctx.frontmatter`/`{{fm.*}}`, template-via-frontmatter. Update the CLI table (`--template` optional for render/lint). Update `README.md` CLI usage.
- [ ] **Step 3:** Skill (`claude-plugin/skills/druckform/SKILL.md`) — document the frontmatter block in the Document Format section (MCP still passes `template` explicitly).
- [ ] **Step 4:** Commit
```bash
git add .changeset/extensibility-phase-3.md docs/extending-druckform.md README.md claude-plugin/skills/druckform/SKILL.md
git commit -m "docs(druckform): document Phase 3 frontmatter features"
```

---

## Final verification
```bash
pnpm --filter druckform exec vitest run && pnpm --filter druckform-mcp exec vitest run
pnpm --filter druckform typecheck && pnpm --filter druckform-mcp typecheck
pnpm --filter druckform build && pnpm --filter druckform-mcp build
# Optional real PDF: a frontmatter doc with `template: base` rendered with no --template/--style.
```

## Self-Review

**Spec coverage (§5):** frontmatter parsing (T1) · exposed to all components via `ctx.frontmatter` + `{{fm.*}}` (T2) · template-declared schema + validation (T3) · template-from-frontmatter with arg override (T4) · docs (T5).

**Backward compatibility:** `ParsedDocument.frontmatter` and `RenderCtx.frontmatter` are additive (always `{}` when absent); existing `ctx` literals in tests updated. `--template` optional is additive (explicit arg still works). MCP path unchanged.

**Risks:** source-line preservation when frontmatter is stripped (T1 test asserts it); the `--template` optional change must still error clearly when neither arg nor frontmatter provides a name (T4); `RenderCtx.frontmatter` becoming required touches several test `ctx` literals (T2 step 6 sweeps them).
