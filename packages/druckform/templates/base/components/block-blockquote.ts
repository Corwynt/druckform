import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:blockquote", description: "Markdown blockquote", acceptsChildren: true };

export function render(
  _params: unknown,
  children: string,
  _ctx: RenderCtx,
  _element?: BlockElement,
): string {
  return `\\begin{quote}\n${children}\n\\end{quote}`;
}
