import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/examples/components");

describe("examples gallery", () => {
  it("callout renders a variant-styled box", async () => {
    const out = await renderComponent(
      path.join(DIR, "callout.ts"),
      { variant: "warn", title: "Heads up" },
      {
        children: "Body",
      },
    );
    expect(out).toContain("Body");
    expect(out).toContain("\\begin{callout}");
  });

  it("document shell emits the body marker and not the engine core", async () => {
    const out = await renderComponent(
      path.join(DIR, "document.ts"),
      {},
      {
        element: {
          kind: "document",
          documentclass: "article",
          stylePreamble: "%S",
          componentPreamble: "%C",
          frontmatter: {},
        },
      },
    );
    expect(out).toContain("DRUCKFORM_BODY");
    expect(out).not.toContain("\\documentclass");
  });

  it("fancy-table renders a tabularx from a table element", async () => {
    const out = await renderComponent(
      path.join(DIR, "fancy-table.ts"),
      {},
      {
        element: {
          kind: "table",
          alignments: ["left", "right"],
          header: ["A", "B"],
          rows: [["1", "2"]],
        },
      },
    );
    expect(out).toContain("\\begin{tabularx}");
  });
});
