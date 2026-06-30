import type { DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "asset-test shell", acceptsChildren: true };

export function render(_p: unknown, _c: string, ctx: RenderCtx, el?: DocumentLayout): string {
  const layout = el as DocumentLayout;
  return [
    `% logo=${ctx.asset("logo.pdf")}`,
    `% dir=${ctx.templateDir}`,
    layout.stylePreamble,
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
