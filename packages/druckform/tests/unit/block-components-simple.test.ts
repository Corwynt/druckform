import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { BlockElement } from "../../src/sdk/types.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/base/components");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };
const load = (f: string) => loadComponent(path.join(DIR, f), "");
const el = (e: BlockElement) => e;

describe("simple block components", () => {
  it("heading maps levels 1..6 to section..subparagraph", async () => {
    const def = await load("block-heading.ts");
    expect(def.render({}, "Title", ctx, el({ kind: "heading", level: 1 }))).toBe("\\section{Title}");
    expect(def.render({}, "T", ctx, el({ kind: "heading", level: 3 }))).toBe("\\subsubsection{T}");
    expect(def.render({}, "T", ctx, el({ kind: "heading", level: 6 }))).toBe("\\subparagraph{T}");
  });

  it("blockquote wraps children in quote", async () => {
    const def = await load("block-blockquote.ts");
    expect(def.render({}, "Quoted text", ctx, el({ kind: "blockquote" }))).toBe(
      "\\begin{quote}\nQuoted text\n\\end{quote}",
    );
  });

  it("hr emits a rule", async () => {
    const def = await load("block-hr.ts");
    expect(def.render({}, "", ctx, el({ kind: "hr" }))).toBe("\\noindent\\rule{\\linewidth}{0.4pt}");
  });

  it("image emits includegraphics with the resolved src", async () => {
    const def = await load("block-image.ts");
    expect(
      def.render({}, "", ctx, el({ kind: "image", src: "/abs/pic.png", alt: "x", title: null })),
    ).toBe("\\includegraphics[max width=\\linewidth]{/abs/pic.png}");
  });

  it("codeblock emits lstlisting with raw code", async () => {
    const def = await load("block-codeblock.ts");
    const out = def.render({}, "", ctx, el({ kind: "codeblock", language: "ts", code: "a & b" }));
    expect(out).toBe("\\begin{lstlisting}\na & b\n\\end{lstlisting}");
  });
});
