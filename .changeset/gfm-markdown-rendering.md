---
"druckform": minor
---

Render full GitHub Flavored Markdown: tables, ordered/nested lists, task lists,
links, autolinks, images, blockquotes, fenced code blocks, strikethrough, and
horizontal rules. Block-level elements are implemented as built-in components in
the `base` template under a reserved `block:` namespace, so templates can
override how any of them render via the existing extension chain.
