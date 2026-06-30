---
"druckform": minor
"druckform-mcp": minor
---

Add a fast single-component preview loop: `druck preview-component` (with `--watch`)
renders one component with sample params/children to a PDF, defaulting to the
component's `meta.example`. New MCP `preview_component` tool returns a download_url.
Internally, the render pipeline gains a non-exiting `renderToFile` core.
