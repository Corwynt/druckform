import { describe, expect, it } from "vitest";
import { listTemplatesTool } from "../src/tools/list-templates.js";
import { listComponentsTool } from "../src/tools/list-components.js";

describe("tool descriptions are free of German flavour vocabulary", () => {
  it("list_templates description has no 'Sätze'", () => {
    expect(listTemplatesTool.description).not.toMatch(/Sätze|Satz/);
  });
  it("list_components description has no 'Lettern'", () => {
    expect(listComponentsTool.description).not.toMatch(/Lettern|Letter/);
  });
});
