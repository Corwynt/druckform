import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "echo-hr", description: "test", acceptsChildren: false };
export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  return element ? `KIND:${element.kind}` : "NO-ELEMENT";
}
