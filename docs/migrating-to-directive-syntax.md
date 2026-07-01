# Handoff: migrate documents to druckform's directive syntax

**Audience:** an agent editing druckform Markdown documents authored against the *old* component syntax.
**Goal:** convert every component invocation to the new CommonMark generic-directives syntax. This is a **breaking** syntax change in druckform; documents using the old form no longer parse correctly.

## What changed (one sentence)

Component blocks moved from the bespoke `::: name key="value"` form to the generic-directives form `:::name{key="value"}` — the space after the colons is gone and attributes now live inside a `{ … }` block. Two new lightweight forms (inline and leaf) were also added, but adopting them is optional.

## The ONE required transformation (container components)

Every **opening** component fence must change. Rule:

- Old opening line: `::: <name> <attrs>`  →  New: `:::<name>{<attrs>}`
  - Remove the space(s) between `:::` and the component name.
  - Wrap the attribute string (everything after the name) in a single `{ … }`.
  - The attribute text itself is unchanged: `key="value"` pairs, space-separated, stay exactly as they were.
- The **closing** fence — a line that is just `:::` — is **unchanged**.
- Nested components: apply the same rule to each opening line at every depth.

### Examples

```
OLD:
::: infobox title="Note" accent="accent"
Body text.
:::

NEW:
:::infobox{title="Note" accent="accent"}
Body text.
:::
```

```
OLD (nested):
::: infobox title="Outer"
::: infobox title="Inner"
x
:::
:::

NEW:
:::infobox{title="Outer"}
:::infobox{title="Inner"}
x
:::
:::
```

A component with no attributes: `::: banner` → `:::banner{}` (empty braces are fine; `:::banner` also works).

### A safe mechanical transform

Only opening fences (3 colons, a space, then a name) change; bare `:::` closers do not. As a regex over each line:

- Match: `^:::[ \t]+(\S+)[ \t]*(.*?)[ \t]*$`  (a name is present)
- Replace with: `:::$1{$2}`
- Do **not** touch lines that are exactly `:::` (closers).

Prefer editing with judgment over blind sed — verify each block visually after transforming.

## What you do NOT need to change

- **Frontmatter** (the `--- … ---` block), headings, paragraphs, lists, tables, code fences, blockquotes, links — all ordinary Markdown is unchanged.
- **Images** `![alt](src "title")` — unchanged. (Note: a `maxheight=<fraction>` directive in the image title, e.g. `![logo](logo.pdf "maxheight=0.4")`, caps its height; that's a feature, not a required change.)
- **Diagram fences** ` ```mermaid ` / ` ```plantuml ` — unchanged. (An optional `maxheight=` info-string is available: ` ```mermaid maxheight=0.5 `.)
- Prose colons (`10:30`, `https://…`, `see 4:1`) are safe — inline directives only fire on `:name[` or `:name{`.

## Optional: new capabilities (use only if wanted)

- **Attributes** now accept `#id` and `.class` in the brace block too: `:::infobox{#intro .highlight title="Note"}`.
- **Inline components** (mid-sentence): `:name[content]{attrs}` — e.g. `Status: :badge[NEW]{tone=warn}.` Only fires for components whose `form` is `inline`.
- **Leaf components** (own line, no body): `::name[content]{attrs}`.
- **Raw passthrough** (escape hatch for LaTeX the component model can't express): `:::raw{format=latex}` … `:::` emits its body verbatim (unescaped); inline `:raw[\LaTeX{}]{format=latex}` and leaf `::raw[…]{format=latex}` too.
- To write a literal colon that would otherwise start an inline directive, escape it: `\:` (standard Markdown backslash-escaping).

## Discover a template's components (recommended before editing)

Run this to see each component's exact name, params, whether it takes children, its `form` (inline/leaf/container), and a working `example`:

```
druck components --template <template-name> --json
# or the MCP tool: list_components({ template: "<template-name>" })
```

## Verify after migrating

1. Render the document and confirm it succeeds with no parse/render errors:
   ```
   druck render --template <t> --in <doc>.md --assets <dir> --out /tmp/out.pdf
   # or MCP: render_markdown({ document, template })
   ```
2. Open the PDF and confirm each component renders as before (title blocks, callouts, boxes, etc.).
3. Optionally run `druck lint --template <t> --in <doc>.md` for a machine-readable check.

If a render error names an "Unknown component", the name was mistyped or the `:::`→`:::name{}` transform was missed on that line. If a block renders as plain text, its opening fence still has the old `::: name` (space) form.

## Reference

Full syntax + attribute model: `docs/extending-druckform.md` §3.2 "Directive components". Design rationale: `docs/superpowers/specs/2026-07-01-inline-leaf-components-design.md`.
