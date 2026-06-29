import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "Document shell", acceptsChildren: true };

// The document shell owns everything AFTER the engine-core packages: it places
// the style and component preambles, opens/closes the document, and marks where
// the body goes (DRUCKFORM_BODY). It does NOT emit \documentclass or the engine
// packages (fontspec/xcolor/graphicx/hyperref/ulem) — those are injected by the
// composer and are not overrideable. Override this component to control geometry,
// page style, title block, etc.
export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
