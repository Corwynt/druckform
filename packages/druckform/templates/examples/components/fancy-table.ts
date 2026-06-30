import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "block:table",
  description: "Booktabs table with a shaded header",
  acceptsChildren: false,
};
export const preamble = [
  "\\usepackage{tabularx}",
  "\\usepackage{booktabs}",
  "\\usepackage{array}",
].join("\n");

function col(a: "left" | "center" | "right" | null): string {
  if (a === "center") return ">{\\centering\\arraybackslash}X";
  if (a === "right") return ">{\\raggedleft\\arraybackslash}X";
  return ">{\\raggedright\\arraybackslash}X";
}

export function render(_p: unknown, _c: string, _ctx: RenderCtx, element?: BlockElement): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments.map(col).join("");
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
