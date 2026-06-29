import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { mdToLatex } from "../../src/latex/md-to-latex.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import type { EmitOpts } from "../../src/latex/tokens-to-latex.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };
let opts: EmitOpts;

beforeAll(async () => {
  const all = loadAllTemplates(BUNDLED);
  const template = await resolveTemplate("base", all);
  opts = { template, ctx, assetsRoot: "/assets" };
});

describe("mdToLatex (GFM)", () => {
  it("escapes plain inline text and bold/italic/code", () => {
    expect(mdToLatex("a **b** *c* `d&e`", opts)).toContain(
      "a \\textbf{b} \\textit{c} \\texttt{d\\&e}",
    );
  });

  it("renders a heading via block:heading", () => {
    expect(mdToLatex("# Title", opts)).toContain("\\section{Title}");
  });

  it("renders an unordered list via block:list", () => {
    expect(mdToLatex("- one\n- two", opts)).toContain(
      "\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}",
    );
  });

  it("renders an ordered list", () => {
    expect(mdToLatex("1. one\n2. two", opts)).toContain("\\begin{enumerate}");
  });

  it("renders a task list with checkboxes", () => {
    expect(mdToLatex("- [x] done\n- [ ] todo", opts)).toContain(
      "\\item[$\\boxtimes$] done\n\\item[$\\square$] todo",
    );
  });

  it("renders a GFM table with alignment", () => {
    const out = mdToLatex("| A | B |\n|:--|--:|\n| 1 | 2 |", opts);
    expect(out).toContain("\\begin{tabularx}{\\linewidth}{>{\\raggedright\\arraybackslash}X>{\\raggedleft\\arraybackslash}X}");
    expect(out).toContain("\\textbf{A} & \\textbf{B} \\\\");
    expect(out).toContain("1 & 2 \\\\");
  });

  it("renders a blockquote", () => {
    expect(mdToLatex("> quoted", opts)).toContain("\\begin{quote}");
  });

  it("renders a fenced code block verbatim (no escaping of body)", () => {
    expect(mdToLatex("```\na & b\n```", opts)).toContain(
      "\\begin{lstlisting}\na & b\n\\end{lstlisting}",
    );
  });

  it("renders a link with hyperref", () => {
    expect(mdToLatex("[text](https://x.com)", opts)).toContain("\\href{https://x.com}{text}");
  });

  it("renders strikethrough", () => {
    expect(mdToLatex("~~gone~~", opts)).toContain("\\sout{gone}");
  });

  it("renders a horizontal rule", () => {
    expect(mdToLatex("---", opts)).toContain("\\noindent\\rule{\\linewidth}{0.4pt}");
  });

  it("resolves image paths against the assets root", () => {
    expect(mdToLatex("![alt](pic.png)", opts)).toContain(
      "\\includegraphics[max width=\\linewidth]{/assets/pic.png}",
    );
  });
});
