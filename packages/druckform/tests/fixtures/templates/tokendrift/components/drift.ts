import type { RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({ title: z.string() });
export const meta = {
  name: "drift",
  description: "uses warning token without declaring it",
  acceptsChildren: false,
};

export function render(params: { title: string }, _children: string, ctx: RenderCtx): string {
  return `${ctx.token("warning")}{${params.title}}`; // 'warning' not in requiredTokens
}
