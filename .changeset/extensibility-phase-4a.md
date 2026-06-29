---
"druckform-mcp": minor
---

Phase 4 (Part A) — `render_markdown`: a new MCP tool that renders an asset-less
Markdown document to PDF inline, with no ZIP and no upload step. Pass the document
text directly; `template` and `style` are optional (template may come from the
document's frontmatter, style from the template). Returns a `download_url`.

Also fixes `renderDocument` in the CLI runner to return the structured error
contract on render failure (instead of throwing) and to support optional
`--template`/`--style`, which makes `finalize_job`'s error path report findings.
