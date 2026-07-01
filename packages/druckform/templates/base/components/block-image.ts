import type { BlockElement, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:image", description: "Markdown image", acceptsChildren: false };
export const preamble = "\\usepackage[export]{adjustbox}"; // provides "max width=" / "max totalheight=" keys

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "image") return "";
  // A `maxheight=<n>` directive in the image title caps this image at <n>\textheight;
  // otherwise fall back to the theme-overridable \druckImageMaxHeight default.
  // Regex mirrors parseMaxHeightFraction from src/ but inlined here (bundled component cannot import src/).
  const m = element.title?.match(/maxheight=(\d*\.?\d+)/);
  const maxHeight = m ? `${m[1]}\\textheight` : "\\druckImageMaxHeight";
  return `\\includegraphics[max width=\\linewidth, max totalheight=${maxHeight}]{${element.src}}`;
}
