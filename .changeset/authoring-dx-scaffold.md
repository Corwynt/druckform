---
"@druckform/core": minor
---

Scaffold and auto-discover components. Drop a file in a template's `components/`
directory and it is registered automatically (TS by filename stem, YAML by its
`name:` field); explicit `template.yaml` entries still win. New `druck new
template` and `druck new component` generators emit ready-to-edit boilerplate
(and a starter test for in-repo templates).
