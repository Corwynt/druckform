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
