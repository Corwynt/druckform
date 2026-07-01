import { tokenRef } from "@druckform/core";
import type { RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({ accent: tokenRef("accent"), title: z.string() });
export const meta = { name: "tref", description: "token-ref test", acceptsChildren: false };

export function render(
  params: { accent: string; title: string },
  _children: string,
  ctx: RenderCtx,
): string {
  return `${ctx.token(params.accent)}{${params.title}}`;
}
