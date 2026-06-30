# Examples Gallery

The `examples` template ships three canonical, copy-pasteable components that cover the most common authoring patterns. Each demonstrates a different aspect of the component contract.

To use these components as a starting point, copy the relevant file into your own template's `components/` directory, rename `meta.name`, then run `druck doctor` and `druck preview-component` to verify it is wired up correctly.

---

## callout — params + children + token declaration

Demonstrates: accepting named params, rendering children, and declaring required style tokens via `meta.requiredTokens`.

```ts
import type { Component, RenderCtx } from "druckform";
import { Tex, raw } from "druckform";
import { z } from "zod";

export const schema = z.object({
  variant: z.enum(["info", "warn", "danger"]).default("info"),
  title: z.string(),
});

export const meta = {
  name: "callout",
  description: "Variant-styled callout box with a title.",
  acceptsChildren: true,
  example: '::: callout variant="warn" title="Heads up"\nBody\n:::',
  requiredTokens: ["accent", "warning"],
};

export const preamble = `\\newenvironment{callout}[2]{%
  \\par\\vspace{0.5em}\\noindent{\\leavevmode#1\\bfseries#2}\\par
  \\noindent\\rule{\\linewidth}{0.5pt}\\par\\smallskip\\noindent\\ignorespaces
}{\\par\\vspace{0.5em}}`;

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const color = params.variant === "warn" ? ctx.token("warning") : ctx.token("accent");
  return Tex`\begin{callout}{${raw(color)}}{${params.title}}
${raw(children)}
\end{callout}`;
};
```

---

## document — titled A4 document shell override

Demonstrates: overriding the `document` component to control geometry, preamble placement, and the title block. The shell **must** emit `DRUCKFORM_BODY` — the engine replaces this placeholder with the rendered body. It must **not** emit `\documentclass` (the engine injects that).

```ts
import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "Titled A4 document shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  const title = (element as DocumentLayout).frontmatter.title as string | undefined;
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\usepackage[a4paper,margin=2.5cm]{geometry}",
    "\\begin{document}",
    title ? `\\section*{${title}}` : "",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
```

---

## fancy-table — `block:table` structured element override

Demonstrates: overriding a reserved `block:` component that receives a structured `BlockElement` payload instead of children. The component reads `element.alignments`, `element.header`, and `element.rows` to produce a `tabularx` table with booktabs rules.

```ts
import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:table", description: "Booktabs table with a shaded header", acceptsChildren: false };
export const preamble = ["\\usepackage{tabularx}", "\\usepackage{booktabs}", "\\usepackage{array}"].join("\n");

function col(a: "left" | "center" | "right" | null): string {
  if (a === "center") return ">{\\centering\\arraybackslash}X";
  if (a === "right") return ">{\\raggedleft\\arraybackslash}X";
  return ">{\\raggedright\\arraybackslash}X";
}

export function render(
  _p: unknown,
  _c: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments.map(col).join("");
  const header = `${element.header.map((c) => `\\textbf{${c}}`).join(" & ")} \\\\`;
  const body = element.rows.map((r) => `${r.join(" & ")} \\\\`).join("\n");
  return [
    `\\begin{tabularx}{\\linewidth}{${cols}}`,
    "\\toprule",
    header,
    "\\midrule",
    body,
    "\\bottomrule",
    "\\end{tabularx}",
  ].join("\n");
}
```

---

Copy one into your template's `components/`, rename `meta.name`, run `druck doctor` and `druck preview-component`.
