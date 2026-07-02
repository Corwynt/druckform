# @druckform/core

## 0.2.0

### Minor Changes

- 57a0aa8: Authoring agent surface: `list_components` now returns each component's source,
  an `acceptsElement` flag, and a contract version. New MCP tools `scaffold_component`
  and `validate_component` drive `druck new`/`druck doctor` within
  DRUCKFORM_TEMPLATES_DIR. Adds an examples gallery (`examples` template) and a
  `druckform-authoring` skill encoding the component/template contract and the
  scaffold → doctor → preview loop.
- 65fa930: Add `druck doctor --template <name>` — an authoring linter that validates a
  template's components and config: missing exports, declarative `emits` slots that
  match no param, style-token drift, unescaped param interpolation, and a `document`
  shell that forgets the body marker. JSON output via `--json`.
- 8f48474: Add a fast single-component preview loop: `druck preview-component` (with `--watch`)
  renders one component with sample params/children to a PDF, defaulting to the
  component's `meta.example`. New MCP `preview_component` tool returns a download_url.
  Internally, the render pipeline gains a non-exiting `renderToFile` core.
- a890e1c: Scaffold and auto-discover components. Drop a file in a template's `components/`
  directory and it is registered automatically (TS by filename stem, YAML by its
  `name:` field); explicit `template.yaml` entries still win. New `druck new
template` and `druck new component` generators emit ready-to-edit boilerplate
  (and a starter test for in-repo templates).
- fd75bc8: Phase 1 extensibility: templates may remove an inherited component with `null`
  (rejected for built-in `block:*`); TS components derive `requiredTokens` from a
  `tokenRef()` schema helper (no separate `meta.requiredTokens` needed); the MCP
  HTTP server binds an ephemeral port by default (`DRUCKFORM_HTTP_PORT=0`) to avoid
  clashes between concurrent instances; removed internal Satz/Letter vocabulary from
  tool and CLI descriptions.
- 0e08c7e: Phase 2 extensibility — self-contained templates:

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

- c92628b: Phase 3 extensibility — document frontmatter:

  - Documents may begin with a `---` YAML frontmatter block; body source-line
    numbers are preserved for error mapping.
  - Templates declare a `frontmatter:` schema (per-field `required`/`default`),
    merged down the `extends` chain and validated by `lint`.
  - Frontmatter values are exposed to every component via `ctx.frontmatter` (TS) and
    `{{fm.<key>}}` slots (declarative, escaped), with template-schema defaults applied.
  - The template can be selected from frontmatter (`template: <name>`); an explicit
    `--template` argument overrides it, so `--template` is now optional for
    `druck render` / `druck lint`. (The MCP `render_document` still takes `template`.)

- a8c2316: Render full GitHub Flavored Markdown: tables, ordered/nested lists, task lists,
  links, autolinks, images, blockquotes, fenced code blocks, strikethrough, and
  horizontal rules. Block-level elements are implemented as built-in components in
  the `base` template under a reserved `block:` namespace, so templates can
  override how any of them render via the existing extension chain.

### Patch Changes

- a0429d7: Render with Tectonic's network access enabled (drop `--only-cached`). Missing LaTeX packages and fonts now download on demand instead of failing when absent from the cache, so a local install no longer needs a pre-warmed cache before the first render. `--untrusted` (shell-escape hardening) is unchanged. For offline/hermetic rendering, pre-warm the cache and run Tectonic with `--only-cached` externally.
- a0429d7: Fix render output path: Tectonic names its PDF after the input stem (`document.pdf`) and ignores the requested `--out` filename, so the rendered PDF was written to the wrong path. `runTectonic` now renames the produced file to the requested output path, so `druck render --out <file>` and the MCP `finalize_job` / download step find the PDF where they expect it.
