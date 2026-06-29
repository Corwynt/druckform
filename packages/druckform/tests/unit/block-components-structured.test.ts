import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { BlockElement } from "../../src/sdk/types.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/base/components");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };
const load = (f: string) => loadComponent(path.join(DIR, f), "");
const el = (e: BlockElement) => e;

describe("structured block components", () => {
  it("table builds tabularx with alignment, bold header, and booktabs rules", async () => {
    const def = await load("block-table.ts");
    const out = def.render({}, "", ctx, el({
      kind: "table",
      alignments: ["left", "center"],
      header: ["A", "B"],
      rows: [["1", "2"], ["3", "4"]],
    }));
    expect(out).toBe(
      [
        "\\begin{tabularx}{\\linewidth}{>{\\raggedright\\arraybackslash}X>{\\centering\\arraybackslash}X}",
        "\\toprule",
        "\\textbf{A} & \\textbf{B} \\\\",
        "\\midrule",
        "1 & 2 \\\\",
        "3 & 4 \\\\",
        "\\bottomrule",
        "\\end{tabularx}",
      ].join("\n"),
    );
  });

  it("unordered list emits itemize", async () => {
    const def = await load("block-list.ts");
    const out = def.render({}, "", ctx, el({
      kind: "list",
      ordered: false,
      start: null,
      items: [{ content: "one", task: null }, { content: "two", task: null }],
    }));
    expect(out).toBe("\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}");
  });

  it("ordered list emits enumerate", async () => {
    const def = await load("block-list.ts");
    const out = def.render({}, "", ctx, el({
      kind: "list",
      ordered: true,
      start: null,
      items: [{ content: "one", task: null }],
    }));
    expect(out).toBe("\\begin{enumerate}\n\\item one\n\\end{enumerate}");
  });

  it("task list items render checkbox symbols", async () => {
    const def = await load("block-list.ts");
    const out = def.render({}, "", ctx, el({
      kind: "list",
      ordered: false,
      start: null,
      items: [
        { content: "done", task: "checked" },
        { content: "todo", task: "unchecked" },
      ],
    }));
    expect(out).toBe(
      "\\begin{itemize}\n\\item[$\\boxtimes$] done\n\\item[$\\square$] todo\n\\end{itemize}",
    );
  });
});
