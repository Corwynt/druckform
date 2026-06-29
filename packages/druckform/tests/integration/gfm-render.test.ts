import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseDocument } from "../../src/parse/parser.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import type { StyleConfig } from "../../src/sdk/types.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
const DOC = path.resolve(import.meta.dirname, "../fixtures/documents/gfm-kitchensink.md");
const style: StyleConfig = {
  $schema: "style-v1",
  tokens: { colors: { accent: "#111111", warning: "#222222" } },
};

describe("GFM kitchen-sink", () => {
  it("renders every element through the base template", async () => {
    const template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
    const { tex } = composeDocument(parseDocument(DOC), template, style, new Map(), USER);
    for (const fragment of [
      "\\section{Heading 1}",
      "\\textbf{bold}",
      "\\textit{italic}",
      "\\texttt{code}",
      "\\sout{strike}",
      "\\href{https://example.com}{link}",
      "\\begin{itemize}",
      "\\begin{enumerate}",
      "\\item[$\\boxtimes$] done",
      "\\item[$\\square$] todo",
      "\\begin{quote}",
      "\\begin{tabularx}",
      "\\begin{lstlisting}",
      "\\noindent\\rule{\\linewidth}{0.4pt}",
    ]) {
      expect(tex).toContain(fragment);
    }
  });

  it("lets a template override block:table through the extension chain", async () => {
    const all = loadAllTemplates(BUNDLED, USER);
    const template = await resolveTemplate("fancy", all);
    const { tex } = composeDocument(parseDocument(DOC), template, style, new Map(), USER);
    expect(tex).toContain("%FANCYTABLE rows=1");
    expect(tex).not.toContain("\\begin{tabularx}");
  });
});
