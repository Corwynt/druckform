import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "document",
  description: "Titled A4 document shell",
  acceptsChildren: true,
};

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  const title = (element as DocumentLayout).frontmatter.title as string | undefined;
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\usepackage[a4paper,margin=2.5cm]{geometry}",
    "\\begin{document}",
    title ? `\\section*{${title}}` : "",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
