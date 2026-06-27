import { z } from "zod";
import { Tex, raw } from "../../../src/sdk/tex.js";
import type { Component, RenderCtx } from "../../../src/sdk/types.js";

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

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const color = params.variant === "warn"
    ? ctx.token("warning")
    : ctx.token("accent");
  return Tex`\begin{callout}{${raw(color)}}{${params.title}}
${raw(children)}
\end{callout}`;
};
