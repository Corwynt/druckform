import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "block:heading",
  description: "Markdown heading",
  acceptsChildren: true,
};

const CMDS = [
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
  "subparagraph",
];

export function render(
  _params: unknown,
  children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "heading") return children;
  const cmd = CMDS[element.level - 1] ?? "paragraph";
  return `\\${cmd}{${children}}`;
}
