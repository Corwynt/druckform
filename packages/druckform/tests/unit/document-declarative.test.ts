import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { DocumentLayout } from "../../src/sdk/types.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures/components/document-shell.component.yaml");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };

const layout: DocumentLayout = {
  kind: "document",
  documentclass: "report",
  stylePreamble: "%STYLE",
  componentPreamble: "%COMPONENTS",
  frontmatter: {},
};

describe("declarative document shell", () => {
  it("substitutes the document-payload slots (raw) and the body marker", async () => {
    const def = await loadComponent(FIX, "");
    const out = def.render({}, "", ctx, layout);
    expect(out).toContain("%STYLE");
    expect(out).toContain("%COMPONENTS");
    expect(out).toContain("\\documentclass-was-report");
    expect(out).toContain("DRUCKFORM_BODY");
    expect(out).not.toContain("{{body}}");
    expect(out).not.toContain("{{stylePreamble}}");
  });
});
