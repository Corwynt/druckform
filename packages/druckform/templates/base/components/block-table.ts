import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:table", description: "Markdown table", acceptsChildren: false };
export const preamble = ["\\usepackage{tabularx}", "\\usepackage{booktabs}", "\\usepackage{array}"].join("\n");

function colType(align: "left" | "center" | "right" | null): string {
  if (align === "center") return ">{\\centering\\arraybackslash}X";
  if (align === "right") return ">{\\raggedleft\\arraybackslash}X";
  return ">{\\raggedright\\arraybackslash}X";
}

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments.map(colType).join("");
  const header = `${element.header.map((c) => `\\textbf{${c}}`).join(" & ")} \\\\`;
  const body = element.rows.map((r) => `${r.join(" & ")} \\\\`).join("\n");
  return [
    `\\begin{tabularx}{\\linewidth}{${cols}}`,
    "\\toprule",
    header,
    "\\midrule",
    body,
    "\\bottomrule",
    "\\end{tabularx}",
  ].join("\n");
}
