import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:image", description: "Markdown image", acceptsChildren: false };
export const preamble = "\\usepackage[export]{adjustbox}"; // provides "max width=" key

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "image") return "";
  return `\\includegraphics[max width=\\linewidth]{${element.src}}`;
}
