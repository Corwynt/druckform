---
"druckform": minor
---

Add `druck doctor --template <name>` — an authoring linter that validates a
template's components and config: missing exports, declarative `emits` slots that
match no param, style-token drift, unescaped param interpolation, and a `document`
shell that forgets the body marker. JSON output via `--json`.
