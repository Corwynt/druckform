import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "document",
  description:
    "document shell that throws when frontmatter.title is missing — a normal pattern that the probe must not crash on",
  acceptsChildren: true,
};

export function render(
  _p: unknown,
  _c: string,
  ctx: RenderCtx,
  el?: BlockElement | DocumentLayout,
): string {
  if (!el || el.kind !== "document") return "";
  // Normal authoring pattern: read a frontmatter field.
  // The probe passes ctx.frontmatter={}, so title is undefined → toUpperCase() throws.
  const title = (ctx.frontmatter.title as string).toUpperCase();
  return `${el.stylePreamble}\n${title}\nDRUCKFORM_BODY\n\\end{document}`;
}
