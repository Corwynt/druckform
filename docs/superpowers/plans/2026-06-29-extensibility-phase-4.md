# Extensibility Phase 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lower MCP friction. **Part A** adds `render_markdown` — an inline, no-ZIP render path for asset-less documents (the common case). **Part B** (optional, decision below) adds persistent jobs with checksum-delta uploads and `list_job_files` / `delete_job`.

**Design source:** `docs/superpowers/specs/2026-06-29-extensibility-roadmap-design.md` §6.

**Package:** almost entirely `packages/druckform-mcp` (Part A touches `cli-runner` in `druckform`-mcp only).

## Global Constraints

- Run from repo root. **Commit after each task.** Existing tests stay green.
- Build `druckform` so the `druck` CLI (used by `cli-runner` via `DRUCK_BIN`) reflects Phase 1–3 behavior (optional `--template`/`--style`, frontmatter).

## Part A / Part B decision

Part A is the clear, high-value, low-risk half and completes the roadmap's "render with just a document" vision. **Part B** is an edit-loop optimization that (a) introduces a client-orchestrated delta-upload protocol and (b) **changes the token model** from single-use to re-issuable per-job tokens. Recommendation: ship **Part A now**; treat Part B as a follow-up that gets its own detailed plan if greenlit. This plan details Part A fully and outlines Part B.

---

## Part A — `render_markdown` (no-ZIP inline path)

### Task A1: Make the render runner flag-optional and exit-code-tolerant

**Files:**
- Modify: `packages/druckform-mcp/src/cli-runner.ts`
- Test: `packages/druckform-mcp/tests/cli-runner.test.ts` (extend)

**Why:** `renderDocument` currently passes `--template`/`--style` unconditionally and uses `runOrThrow`, which **throws on exit 1** — but `druck render` exits 1 *with a valid JSON error contract on stdout*. So today the structured error contract is lost (and `finalize_job`'s `status: "error"` branch is effectively dead). `render_markdown` needs optional template/style and the real error contract.

**Interface:** `renderDocument(template: string | undefined, stylePath: string | undefined, inFile: string, assetsDir: string, outPdf: string): RenderContract`.

- [ ] **Step 1: Write/extend the failing test** — assert `renderDocument` (with `DRUCK_BIN` pointing at the built CLI) returns a `status: "error"` contract (not a throw) when rendering a doc with no resolvable template; and returns `status: "ok"` for a valid frontmatter doc with no `--template`/`--style`.

- [ ] **Step 2: Run to verify it fails** (currently throws on the error case).

- [ ] **Step 3: Implement** — replace `renderDocument`:
```ts
export function renderDocument(
  template: string | undefined,
  stylePath: string | undefined,
  inFile: string,
  assetsDir: string,
  outPdf: string,
): RenderContract {
  const args = ["render", "--in", inFile, "--assets", assetsDir, "--out", outPdf];
  if (template) args.push("--template", template);
  if (stylePath) args.push("--style", stylePath);
  const { stdout, stderr } = run(args); // do NOT throw on exit 1 — the contract is on stdout
  try {
    return JSON.parse(stdout) as RenderContract;
  } catch {
    throw new Error(`druck render produced no parseable contract: ${stderr || stdout || "(empty)"}`);
  }
}
```
(`finalize_job` still passes `job.template`/`stylePath` as strings — unaffected. Its now-reachable `status: "error"` branch starts working.)

- [ ] **Step 4: Run the test + the existing finalize/cli-runner tests + typecheck.**

- [ ] **Step 5: Commit**
```bash
git add packages/druckform-mcp/src/cli-runner.ts packages/druckform-mcp/tests/cli-runner.test.ts
git commit -m "fix(druckform-mcp): renderDocument returns the error contract (not a throw) and supports optional template/style"
```

### Task A2: `createInline` on the job store

**Files:**
- Modify: `packages/druckform-mcp/src/job-store.ts`
- Test: `packages/druckform-mcp/tests/job-store.test.ts` (extend)

**Why:** `store.create` is upload-oriented (takes upload+download tokens, status `pending`). The inline path needs a job dir + a download token, no upload.

**Interface:** `createInline(template: string | undefined, downloadToken: string): Job` — creates the dir, status `pending`, `uploadToken: ""`, `uploadUsed: true`, respects `getMaxJobs()`.

- [ ] **Step 1: Failing test** — `createInline` returns a job with a created dir, a download token, and counts toward the active-jobs cap.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — factor the shared dir/cap logic; `createInline` sets `uploadToken: ""`, `uploadUsed: true`, `style: ""`. (Job `template`/`style` are bookkeeping; the actual values are passed to `renderDocument`.)

- [ ] **Step 4: Run the test + typecheck.**

- [ ] **Step 5: Commit**
```bash
git add packages/druckform-mcp/src/job-store.ts packages/druckform-mcp/tests/job-store.test.ts
git commit -m "feat(druckform-mcp): add JobStore.createInline for the no-upload render path"
```

### Task A3: The `render_markdown` tool

**Files:**
- Create: `packages/druckform-mcp/src/tools/render-markdown.ts`
- Modify: `packages/druckform-mcp/src/mcp-server.ts` (register it)
- Test: `packages/druckform-mcp/tests/render-markdown.test.ts`

**Interface:**
```
render_markdown({ document: string, template?: string, style?: string })
  → { job_id, download_url, expires_at }            // on success
  → { status: "error", error: { summary, findings } } // on render failure
```
`document` is Markdown text (may carry `template:` frontmatter); `style` is optional YAML text. No upload, no ZIP.

- [ ] **Step 1: Write the failing test** — `vi.mock` the `cli-runner` so `renderDocument` writes a stub `out.pdf` and returns `{ status: "ok", pdf }`; call the handler with `{ document: "# Hi" }`; assert the result JSON has a `download_url` and `job_id`, the job is `done`, and `document.md` was written to the job dir. Add an error case: mocked `renderDocument` returns `{ status: "error", error }` → handler returns `status: "error"` and the job is `error`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `render-markdown.ts`** — handler:
  1. `const job = store.createInline(template, downloadToken)` (generate a download token first via `generateToken(job.id, "download")` — mirror render-document’s create-then-token-then-update, or add a small overload).
  2. Write `document.md` (and `style.yaml` when `style` provided) into `job.dir`.
  3. `store.update(job.id, { status: "rendering" })`.
  4. `const result = renderDocument(template, stylePath, inFile, job.dir /*assets*/, outPdf)`.
  5. On `ok`: status `done`, return `{ job_id, download_url, expires_at }`. On `error`: status `error`, return `{ status: "error", error: result.error }`.

- [ ] **Step 4: Register in `mcp-server.ts`**:
```ts
const renderMd = makeRenderMarkdownTool(store, baseUrl);
server.tool(
  renderMd.name,
  renderMd.description,
  { document: z.string(), template: z.string().optional(), style: z.string().optional() },
  async (args) => renderMd.handler(args),
);
```

- [ ] **Step 5: Run the test + full mcp suite + typecheck + build both packages.**

- [ ] **Step 6: Commit**
```bash
git add packages/druckform-mcp/src/tools/render-markdown.ts packages/druckform-mcp/src/mcp-server.ts packages/druckform-mcp/tests/render-markdown.test.ts
git commit -m "feat(druckform-mcp): add render_markdown — inline no-ZIP render for asset-less documents"
```

### Task A4: Docs + changeset (Part A)

- [ ] `.changeset/extensibility-phase-4a.md` (`druckform-mcp` minor; `druckform` patch for the cli-runner fix).
- [ ] Update `docs/extending-druckform.md` (MCP §2: add `render_markdown` to the tool table + a "no-ZIP path" note) and the skill `claude-plugin/skills/druckform/SKILL.md` (mention `render_markdown` for asset-less docs; `template`/`style` optional via frontmatter/template).
- [ ] Commit:
```bash
git add .changeset/extensibility-phase-4a.md docs/extending-druckform.md claude-plugin/skills/druckform/SKILL.md
git commit -m "docs(druckform): document render_markdown (Phase 4 Part A)"
```

---

## Part B — Persistent jobs + delta uploads (OPTIONAL — pending decision)

> Only implement if greenlit. This changes the token model and adds a client-orchestrated protocol; it should get its own detailed, test-first plan. Outline:

- **Persistence & TTL:** don't reap a job on first `finalize`/render; reset `expiresAt` on each upload/render (keep-alive) with a hard max-lifetime cap; jobs survive for reuse.
- **`list_job_files({ job_id }) → [{ name, size, checksum }]`:** sha256 per file under `job.dir`, so the client can diff locally.
- **Delta upload:** a way to request a fresh upload URL for an *existing* job and upload only changed files (or a single changed `.md`), reusing prior assets.
- **`delete_job({ job_id })`:** explicit cleanup.
- **Token model:** single-use upload/download tokens become **re-issuable per job** (job-scoped), since reuse implies multiple uploads/downloads over a job's life. Security: keep the max-lifetime cap firm; tokens still expire.

Risks (from the spec §10): widened job lifetime/auth surface; the delta protocol is only worthwhile for large-asset edit loops.

---

## Final verification (Part A)
```bash
pnpm --filter druckform exec vitest run && pnpm --filter druckform-mcp exec vitest run
pnpm --filter druckform typecheck && pnpm --filter druckform-mcp typecheck
pnpm --filter druckform build && pnpm --filter druckform-mcp build
```

## Self-Review

**Spec coverage:** §6.1 `render_markdown` no-ZIP inline path → Tasks A1–A3. §6.2 persistent jobs → Part B (outlined, gated on decision).

**Backward compatibility:** `renderDocument` signature widens template/style to optional (callers pass strings — unaffected) and stops throwing on render-error exit codes (makes `finalize_job`'s error branch actually work — verify the cli-runner/finalize tests still pass, adapting any that asserted a throw). New tool + new store method are additive. No change to the existing ZIP flow.

**Risks:** the cli-runner exit-code change could affect a test that expected a throw (Task A1 adapts it); `render_markdown` returns a download URL (binary PDF can't be inline), so the existing HTTP download endpoint + token still apply.
