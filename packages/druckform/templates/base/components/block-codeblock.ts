import type { BlockElement, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "block:codeblock",
  description: "Fenced code block",
  acceptsChildren: false,
};
export const preamble = [
  "\\usepackage{listings}",
  "\\lstset{basicstyle=\\ttfamily\\small,breaklines=true,columns=fullflexible,frame=single}",
].join("\n");

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "codeblock") return "";
  return `\\begin{lstlisting}\n${element.code}\n\\end{lstlisting}`;
}
