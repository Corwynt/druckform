---
"@druckform/core": minor
"@druckform/mcp": minor
---

Authoring agent surface: `list_components` now returns each component's source,
an `acceptsElement` flag, and a contract version. New MCP tools `scaffold_component`
and `validate_component` drive `druck new`/`druck doctor` within
DRUCKFORM_TEMPLATES_DIR. Adds an examples gallery (`examples` template) and a
`druckform-authoring` skill encoding the component/template contract and the
scaffold → doctor → preview loop.
