---
"druckform": minor
---

Phase 2 extensibility — self-contained templates:

- Templates may declare an inline `style:` block; styles merge down the `extends`
  chain (root → leaf). The external `--style` file is now an **optional override**
  merged on top of the template's style (it was previously required).
- The document LaTeX shell is now an overrideable `document` component (YAML or
  TS), resolved through the normal extension chain. It receives a typed
  `DocumentLayout` payload (style preamble, deduped component preamble,
  documentclass) and places the body via a marker. The engine-core packages
  (`fontspec`, `xcolor`, `graphicx`, `hyperref`, `ulem`) remain composer-injected
  and non-overridable; the `document` component owns documentclass choice,
  geometry, page style, title block, and body placement.
- The dead `style_defaults` template field is removed in favor of inline `style:`.
