---
"@druckform/mcp": minor
---

Phase 4 (Part B) — persistent jobs & delta uploads for an edit loop:

- Jobs are kept alive on activity (upload / finalize / refresh) with a hard
  24h max-lifetime cap, so a job's assets persist across renders.
- `list_job_files({ job_id })` returns each input file's relative name, byte size,
  and sha256 — diff these locally to find what changed.
- `refresh_job({ job_id })` re-issues fresh upload/download URLs and extends the
  job TTL. Upload a partial zip of only the changed files to the new upload_url,
  then call `finalize_job` again — unchanged files already on the job are reused
  (the bundle merges over the existing job directory).
- `delete_job({ job_id })` removes a job and its working directory.

Tokens are now re-issuable per job (via `refresh_job`) while remaining single-use
per issued URL.
