import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:hr", description: "Horizontal rule", acceptsChildren: false };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  _element?: BlockElement,
): string {
  return "\\noindent\\rule{\\linewidth}{0.4pt}";
}
