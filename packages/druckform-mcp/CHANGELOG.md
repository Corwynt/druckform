# @druckform/mcp

## 1.0.0

### Minor Changes

- 57a0aa8: Authoring agent surface: `list_components` now returns each component's source,
  an `acceptsElement` flag, and a contract version. New MCP tools `scaffold_component`
  and `validate_component` drive `druck new`/`druck doctor` within
  DRUCKFORM_TEMPLATES_DIR. Adds an examples gallery (`examples` template) and a
  `druckform-authoring` skill encoding the component/template contract and the
  scaffold → doctor → preview loop.
- 8f48474: Add a fast single-component preview loop: `druck preview-component` (with `--watch`)
  renders one component with sample params/children to a PDF, defaulting to the
  component's `meta.example`. New MCP `preview_component` tool returns a download_url.
  Internally, the render pipeline gains a non-exiting `renderToFile` core.
- fd75bc8: Phase 1 extensibility: templates may remove an inherited component with `null`
  (rejected for built-in `block:*`); TS components derive `requiredTokens` from a
  `tokenRef()` schema helper (no separate `meta.requiredTokens` needed); the MCP
  HTTP server binds an ephemeral port by default (`DRUCKFORM_HTTP_PORT=0`) to avoid
  clashes between concurrent instances; removed internal Satz/Letter vocabulary from
  tool and CLI descriptions.
- b382315: Phase 4 (Part A) — `render_markdown`: a new MCP tool that renders an asset-less
  Markdown document to PDF inline, with no ZIP and no upload step. Pass the document
  text directly; `template` and `style` are optional (template may come from the
  document's frontmatter, style from the template). Returns a `download_url`.

  Also fixes `renderDocument` in the CLI runner to return the structured error
  contract on render failure (instead of throwing) and to support optional
  `--template`/`--style`, which makes `finalize_job`'s error path report findings.

- 7d60871: Phase 4 (Part B) — persistent jobs & delta uploads for an edit loop:

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

### Patch Changes

- Updated dependencies [57a0aa8]
- Updated dependencies [65fa930]
- Updated dependencies [8f48474]
- Updated dependencies [a890e1c]
- Updated dependencies [a0429d7]
- Updated dependencies [fd75bc8]
- Updated dependencies [0e08c7e]
- Updated dependencies [c92628b]
- Updated dependencies [a8c2316]
- Updated dependencies [a0429d7]
  - @druckform/core@0.2.0
