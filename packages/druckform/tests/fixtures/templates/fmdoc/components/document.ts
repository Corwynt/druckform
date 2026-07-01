import type { BlockElement, DocumentLayout, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "fm shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    `%FM:${element.frontmatter.title ?? ""}`,
    element.stylePreamble,
    element.componentPreamble,
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
