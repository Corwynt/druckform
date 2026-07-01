---
"@druckform/core": minor
---

Phase 3 extensibility — document frontmatter:

- Documents may begin with a `---` YAML frontmatter block; body source-line
  numbers are preserved for error mapping.
- Templates declare a `frontmatter:` schema (per-field `required`/`default`),
  merged down the `extends` chain and validated by `lint`.
- Frontmatter values are exposed to every component via `ctx.frontmatter` (TS) and
  `{{fm.<key>}}` slots (declarative, escaped), with template-schema defaults applied.
- The template can be selected from frontmatter (`template: <name>`); an explicit
  `--template` argument overrides it, so `--template` is now optional for
  `druck render` / `druck lint`. (The MCP `render_document` still takes `template`.)
