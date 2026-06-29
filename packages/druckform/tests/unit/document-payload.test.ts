import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { DocumentLayout } from "../../src/sdk/types.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures/components/echo-document.ts");
const ctx = {
  token: (n: string) => `\\${n}`,
  style: { colors: {}, fonts: {}, spacing: {} },
  frontmatter: {},
};

const layout: DocumentLayout = {
  kind: "document",
  documentclass: "article",
  stylePreamble: "S",
  componentPreamble: "C",
  frontmatter: {},
};

describe("DocumentLayout payload", () => {
  it("passes a DocumentLayout element through to a component", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.render({}, "", ctx, layout)).toBe("KIND:document STYLE:S");
  });

  it("a component sees no document payload on ordinary calls", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.render({}, "", ctx)).toBe("NO-DOC");
  });
});
