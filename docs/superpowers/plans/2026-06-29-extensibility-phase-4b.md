# Extensibility Phase 4B — Persistent Jobs & Delta Uploads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Support an edit loop that reuses a job's assets across renders — keep job files alive, let the client diff via checksums and re-upload only what changed, and add explicit cleanup. Tokens become **re-issuable per job**.

**Design source:** `docs/superpowers/specs/2026-06-29-extensibility-roadmap-design.md` §6.2.

**Package:** `packages/druckform-mcp`.

## Design (reuses existing machinery)

The key insight: the existing upload→unzip→finalize path already merges a zip **over** the job dir (`hardenedUnzip` extracts into `job.dir` without wiping it). So a "delta" is just a partial zip of changed files — unchanged assets already on disk are reused. No new upload/merge mechanism is needed; we only add:

- **Persistence:** jobs already survive (reap only removes expired jobs; `done` jobs aren't auto-deleted). Add **keep-alive** (reset `expiresAt` on upload/finalize/refresh) with a **hard max-lifetime cap** so a kept-alive job can't live forever.
- **`list_job_files`:** sha256 + size per input file, so the client diffs locally.
- **`refresh_job`:** re-issue fresh upload+download tokens, reset the job TTL, and clear `uploadUsed` so the client can upload another delta to the same job.
- **`delete_job`:** explicit cleanup.

Edit loop: `render_document` → upload → `finalize_job` → download (existing). Then: `list_job_files` → diff locally → `refresh_job` → PUT zip-of-changed-files → `finalize_job` → download.

## Global Constraints
- Run from repo root. **Commit after each task.** Existing tests stay green.

---

### Task B1: JobStore — keep-alive (capped) + delete

**Files:** Modify `src/job-store.ts`; extend `tests/job-store.test.ts`.

**Interfaces:**
- `keepAlive(id: string): void` — `expiresAt = min(now + JOB_TTL_MS, createdAt + MAX_LIFETIME_MS)`.
- `delete(id: string): void` — remove the job dir and the map entry.
- `MAX_LIFETIME_MS` constant (24h).

- [ ] **Step 1: Failing tests** — `keepAlive` pushes `expiresAt` forward but never past `createdAt + MAX_LIFETIME_MS`; `delete` removes the dir and `get` returns undefined after.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `keepAlive` and `delete` (with `fs.rmSync(dir, {recursive,force})`).
- [ ] **Step 4: Run tests + typecheck.**
- [ ] **Step 5: Commit** `feat(druckform-mcp): JobStore keep-alive (capped) and delete`.

### Task B2: `list_job_files` tool

**Files:** Create `src/tools/list-job-files.ts`; create `tests/list-job-files.test.ts`; register later (B5).

**Interface:** `list_job_files({ job_id }) → { job_id, files: [{ name, size, checksum }] }` — sha256 of each file under `job.dir`, relative paths, **excluding** internal artifacts `bundle.zip` and `out.pdf`. Sorted by name.

- [ ] **Step 1: Failing test** — create a job dir with `document.md` + `assets/logo.png` + a stray `bundle.zip`/`out.pdf`; assert files list contains `document.md` and `assets/logo.png` with correct sizes and stable sha256, and excludes `bundle.zip`/`out.pdf`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — recursive walk of `job.dir`; `crypto.createHash("sha256")` over each file; skip `bundle.zip` and `out.pdf` at the dir root.
- [ ] **Step 4: Run test + typecheck.**
- [ ] **Step 5: Commit** `feat(druckform-mcp): add list_job_files (size + sha256 per input file)`.

### Task B3: `refresh_job` tool + keep-alive wiring

**Files:** Create `src/tools/refresh-job.ts`; modify `src/http-server.ts` (keep-alive on upload); modify `src/tools/finalize-job.ts` (keep-alive on finalize); create `tests/refresh-job.test.ts`.

**Interface:** `refresh_job({ job_id }) → { job_id, upload_url, download_url, expires_at }` — generate fresh upload+download tokens, `store.update(job, { uploadToken, downloadToken, uploadUsed: false })`, `store.keepAlive(job.id)`.

- [ ] **Step 1: Failing test** — `refresh_job` on an existing job returns fresh `upload_url`/`download_url` (different tokens), resets `uploadUsed` to false, and pushes `expiresAt` forward. (Use the JobStore + `generateToken` directly.)
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `refresh-job.ts` (mirror `render-document`'s create-then-token pattern, but for an existing job).
- [ ] **Step 4: Wire keep-alive** — in the upload handler (`http-server.ts`), after `status: "uploaded"`, call `store.keepAlive(job.id)`; in `finalize-job.ts`, on `ok`, call `store.keepAlive(job_id)` (so an active edit loop stays alive).
- [ ] **Step 5: Run tests (incl. http-server) + typecheck.**
- [ ] **Step 6: Commit** `feat(druckform-mcp): add refresh_job to re-issue per-job URLs; keep jobs alive on activity`.

### Task B4: `delete_job` tool

**Files:** Create `src/tools/delete-job.ts`; create `tests/delete-job.test.ts`.

**Interface:** `delete_job({ job_id }) → { status: "deleted", job_id }` (or a not-found error). Calls `store.delete`.

- [ ] **Step 1: Failing test** — after `delete_job`, `store.get` is undefined and the dir is gone.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run test + typecheck.**
- [ ] **Step 5: Commit** `feat(druckform-mcp): add delete_job for explicit cleanup`.

### Task B5: Register tools + docs + changeset

**Files:** `src/mcp-server.ts`; `docs/extending-druckform.md`; `claude-plugin/skills/druckform/SKILL.md`; `.changeset/extensibility-phase-4b.md`.

- [ ] **Step 1: Register** `list_job_files`, `refresh_job`, `delete_job` in `mcp-server.ts` (all `{ job_id: z.string() }`).
- [ ] **Step 2: Build + full mcp suite + typecheck.**
- [ ] **Step 3: Changeset** (`druckform-mcp` minor): persistent jobs with keep-alive + max-lifetime cap; `list_job_files`/`refresh_job`/`delete_job`; re-issuable per-job tokens; document the delta edit loop.
- [ ] **Step 4: Docs** — MCP tool tables (guide §2 + skill) gain the three tools; add a short "edit loop / delta upload" subsection.
- [ ] **Step 5: Commit** `docs(druckform): document Phase 4B persistent jobs + delta uploads`.

---

## Final verification
```bash
pnpm --filter druckform-mcp exec vitest run && pnpm --filter druckform-mcp typecheck && pnpm --filter druckform-mcp build
pnpm --filter druckform exec vitest run   # unaffected, sanity
```

## Self-Review

**Spec coverage (§6.2):** persistence + activity-reset TTL + max-lifetime (B1, wired in B3) · `list_job_files` checksums (B2) · delta re-upload via partial zip merged over the job dir (existing path + `refresh_job` in B3) · `delete_job` (B4) · re-issuable per-job tokens (B3).

**Backward compatibility:** all additive — new store methods + three new tools + keep-alive calls on existing success paths. The single-use token semantics are preserved (each issued token is still consumed on use); `refresh_job` issues *new* tokens rather than un-consuming old ones. The first-cycle `render_document`→upload→finalize→download flow is unchanged.

**Risks (spec §10):** widened job lifetime — bounded by the hard max-lifetime cap + `delete_job` + the active-jobs concurrency cap (done jobs don't count toward it, but disk is bounded by lifetime). Re-upload to a job mid-render: the upload handler sets `status: "uploaded"`, and `finalize` requires that status — sequential client use is assumed (same as today).
