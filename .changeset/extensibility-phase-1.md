---
"druckform": minor
"druckform-mcp": minor
---

Phase 1 extensibility: templates may remove an inherited component with `null`
(rejected for built-in `block:*`); TS components derive `requiredTokens` from a
`tokenRef()` schema helper (no separate `meta.requiredTokens` needed); the MCP
HTTP server binds an ephemeral port by default (`DRUCKFORM_HTTP_PORT=0`) to avoid
clashes between concurrent instances; removed internal Satz/Letter vocabulary from
tool and CLI descriptions.
