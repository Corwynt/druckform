import { z } from "zod";
import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "document", description: "custom shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    "%CUSTOMDOC",
    element.stylePreamble,
    element.componentPreamble,
    "\\usepackage[a4paper]{geometry}",
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
