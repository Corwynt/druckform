import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { mdToLatex } from "../../src/latex/md-to-latex.js";
import type { ResolvedTemplate } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import { testCtx } from "../helpers/render-component.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");
let template: ResolvedTemplate;

beforeAll(async () => {
  // "inlinetheme" ships a `badge` inline component: emits \fbox{<children>}
  template = await resolveTemplate("inlinetheme", loadAllTemplates(BUNDLED, FIXTURES));
});

function render(src: string): string {
  return mdToLatex(src, { template, ctx: testCtx(), assetsRoot: "/a" });
}

describe("inline directives", () => {
  it("renders a registered inline component with its bracket content", () => {
    expect(render("Status: :badge[NEW] today")).toContain("Status: \\fbox{NEW} today");
  });
  it("passes attributes as params and renders inline markdown in content", () => {
    // badge emits \fbox{<children>}; content **bold** must become \textbf
    expect(render(":badge[**hi**]{tone=warn}")).toContain("\\fbox{\\textbf{hi}}");
  });
  it("does NOT fire on prose colons (colon not followed by a letter+bracket)", () => {
    expect(render("at 10:30 and localhost:8080")).toContain("10:30");
    expect(render("at 10:30 and localhost:8080")).toContain("localhost:8080");
  });
  it("does NOT fire without a following bracket/brace", () => {
    expect(render("a :badge b")).toContain(":badge");
  });
  it("throws on a structurally-fired but unregistered inline name", () => {
    expect(() => render(":nope[x]")).toThrow(/nope/);
  });
});
