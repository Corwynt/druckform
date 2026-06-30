import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "document",
  description: "broken shell — forgets the body marker",
  acceptsChildren: true,
};

export function render(
  _p: unknown,
  _c: string,
  _ctx: RenderCtx,
  el?: BlockElement | DocumentLayout,
): string {
  if (!el || el.kind !== "document") return "";
  return `${el.stylePreamble}\n\\begin{document}\n\\end{document}`; // no DRUCKFORM_BODY
}
