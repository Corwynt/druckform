import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:list", description: "Markdown list", acceptsChildren: false };
export const preamble = "\\usepackage{amssymb}"; // $\square$ / $\boxtimes$

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "list") return "";
  const env = element.ordered ? "enumerate" : "itemize";
  const lines = element.items.map((it) => {
    if (it.task === "checked") return `\\item[$\\boxtimes$] ${it.content}`;
    if (it.task === "unchecked") return `\\item[$\\square$] ${it.content}`;
    return `\\item ${it.content}`;
  });
  return `\\begin{${env}}\n${lines.join("\n")}\n\\end{${env}}`;
}
