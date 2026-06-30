# Template-bundled assets — design

**Date:** 2026-06-30
**Author:** torben (with Claude)
**Status:** Approved design, awaiting implementation plan
**Relates to:** `druckform-authoring-dx-roadmap` (complete), `druckform-extensibility-roadmap` (Phases 1–4 done). B1–B8 DX/docs follow-ups tracked separately (`druckform-theme-feedback-followups`).

## Problem

A corporate theme needs assets that ship **with the template**, not with each
document: a logo in the running header, a footer mark, a watermark, brand icons.
Every document rendered with the theme should get them automatically, without the
author copying files into their document folder.

This is impossible today:

1. The `document` shell has no way to learn an asset location. `RenderCtx`
   exposes only `token()`, `style`, `frontmatter` (`src/sdk/types.ts`). The
   composer has `assetsRoot` but renders the shell without it
   (`src/latex/composer.ts:83`).
2. `resolveAssetPath` resolves only against the document's `--assets` dir
   (`src/sdk/asset-path.ts`), never the template's own directory.
3. tectonic runs in a fresh `mkdtemp` workdir (`src/commands/render.ts:48`), so a
   relative `\includegraphics{logo}` injected from a shell preamble finds nothing.
   `block:image` works only because its `src` is rewritten to an **absolute** path.
4. There is no blessed "component knows its own directory" convention.
5. SVG assets fail silently: `block:image` emits plain `\includegraphics`, and
   tectonic/xelatex cannot read SVG. (Diagrams are pre-converted to PDF; static
   SVG assets are not.)

Net: a theme author cannot reference a logo that ships with the theme. The only
workarounds are bad (hardcode an absolute machine path, or force every document
folder to carry the asset).

## Goal

Give the document shell and components a supported way to reference a file that
ships inside the template directory, make that reference reach tectonic's temp
workdir, and handle SVG assets transparently.

## Non-goals

- B1–B8 DX/docs fixes (tracked separately).
- Watermark / footer mark as distinct features — they are **usages** of the same
  API and will appear only as documentation examples.
- Exposing the document `--assets` root to the shell. The shell's job is
  template-bundled assets; `block:image` continues to own document `--assets`.

## Design

### 1. API surface

`RenderCtx` gains two members:

```ts
interface RenderCtx {
  token(name: string): string;
  style: StyleTokens;
  frontmatter: Record<string, string>;
  templateDir: string;          // NEW — absolute path to the defining template's root dir
  asset(ref: string): string;   // NEW — absolute path to a bundled asset; SVG auto-converted
}
```

- `ctx.asset(ref)` — resolves `ref` against `templateDir`, guards traversal,
  auto-converts SVG → vector PDF, and returns an **absolute** path. PDF/PNG/JPG
  refs pass through as absolute paths (no conversion). Common case:

  ```ts
  const logo = ctx.asset("logo.svg");                  // -> /abs/.../templates/gradion/<converted>.pdf
  return raw(`\\includegraphics[height=8mm]{${logo}}`);
  ```

- `ctx.templateDir` — the raw resolved template root, for power use:

  ```ts
  raw(`\\input{${ctx.templateDir}/preamble.tex}`);
  raw(`\\setmainfont{Foo}[Path=${ctx.templateDir}/fonts/]`);
  ```

Returning **absolute** paths is what lets these references reach tectonic's temp
workdir without copying files — identical to how `block:image` already works
(`src/latex/tokens-to-latex.ts` rewrites `src` to absolute via `resolveAssetPath`).

These live on `ctx` **only** — not on `DocumentLayout`. A single source avoids
drift; the shell reads `ctx.templateDir`/`ctx.asset` like any other component.

### 2. Resolution semantics — defining template's dir

When a template `extends` a parent, each component resolves against the directory
of the template that **defines** it:

- `gradion`'s own shell/components → `templates/gradion/`
- an inherited `report` component → `templates/report/`

So a component shipped by template X always finds X's own assets, even when
rendered under a child template. This avoids the silent-miss footgun where an
inherited component looks in the wrong directory.

Implementation: `ResolvedComponentEntry` gains `templateDir: string`, set to the
owning template's `entry.dir` at registration in `resolver.ts` — on both the
`discoverComponents` path (`resolver.ts:44`) and the explicit-override path
(`resolver.ts:56–66`). The data is already in hand (`entry.dir`). Note this is the
template **root** (`templates/gradion/`), not `dirname(sourcePath)` (which may be
`templates/gradion/components/`).

### 3. Per-component `ctx` and data flow

Because `templateDir` differs per component, the single shared `ctx` becomes a
per-component shallow clone:

- `composer.ts` builds one **base ctx** (`token`/`style`/`frontmatter`, as today).
- For each `render()` call — the shell (`composer.ts:83`) and each component
  (`composer.ts:156`) — it passes a shallow clone with `templateDir` set from that
  component's `ResolvedComponentEntry.templateDir` and `asset` bound to it. Render
  is not hot, so the clone cost is negligible.
- `composeDocument` gains a `workDir` parameter, threaded from `renderToFile`
  (which already creates the workdir, `render.ts:48`). `ctx.asset` writes
  converted SVGs there. `prerenderDiagrams` already runs against the same workdir
  before `composeDocument`.

### 4. SVG handling

`ctx.asset` auto-converts `.svg` refs to a vector PDF via `rsvg-convert -f pdf` —
the **same binary already required** for Mermaid/PlantUML
(`src/diagram/mermaid.ts:28`, `src/diagram/plantuml.ts:38`).

- Converted PDFs are written into `workDir`.
- Conversion is **memoized per ref** within a render (convert once even if the ref
  is referenced repeatedly).
- PDF/PNG/JPG refs skip conversion and resolve to their absolute path.
- **Missing `rsvg-convert` binary, or a conversion failure, is a hard error** —
  surfaced as a render `Finding` that names the offending asset and points at the
  remediation (install `rsvg-convert`). This replaces today's silent failure. We
  hard-error rather than degrade because `rsvg-convert` is already an assumed
  dependency of the diagram pipeline.

### 5. Security & errors

- `ctx.asset` reuses the `asset-path.ts` traversal guard, re-rooted at
  `templateDir`: it refuses absolute refs and any ref that escapes the template
  root. Template authors are trusted (they ship code), but the guard keeps
  behavior consistent with `block:image` and catches typos. Refactor
  `resolveAssetPath` so the guard is shared rather than duplicated.
- `ctx.templateDir` (raw string) has no guard by nature; it is documented as the
  escape-hatch.
- All `ctx.asset` failure modes (missing file, traversal escape, SVG conversion
  failure, missing converter) must surface as a clear, actionable error that names
  the offending asset — reported as a render `Finding` where the pipeline already
  catches render-time errors, never as a silent miss. The exact catch point is an
  implementation detail for the plan.

## Testing

- **Unit (`ctx.asset`):** PDF passthrough returns the absolute path; SVG triggers
  `rsvg-convert` and returns the converted PDF path; repeated refs convert once
  (memoization); absolute/escaping refs are rejected; missing converter yields a
  clear error.
- **Resolver:** `ResolvedComponentEntry.templateDir` is the *defining* template's
  root across an `extends` chain — inherited component → parent dir, override →
  child dir.
- **Integration:** a fixture template with a bundled `logo.svg` and a shell that
  emits `\includegraphics{ctx.asset("logo.svg")}` renders end-to-end to a
  non-empty PDF. This fixture doubles as the worked logo-in-header example for the
  docs follow-up.

## Affected files (anticipated)

- `src/sdk/types.ts` — `RenderCtx` (+`templateDir`, `+asset`),
  `ResolvedComponentEntry` (+`templateDir`).
- `src/sdk/asset-path.ts` — extract a shared, re-rootable traversal-guard resolver.
- `src/template/resolver.ts` — set `templateDir` on each resolved entry.
- `src/latex/composer.ts` — per-component ctx clone; thread `workDir`; build
  `ctx.asset`.
- `src/commands/render.ts` — pass `workDir` to `composeDocument`.
- New: SVG→PDF conversion helper (reusing the `rsvg-convert` invocation pattern
  from `src/diagram/`).
- Tests + a fixture template under `templates/` (or `tests/`).
