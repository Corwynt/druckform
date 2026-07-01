import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/diagram/mermaid.js", () => ({ renderMermaid: vi.fn(() => "/tmp/m.pdf") }));
vi.mock("../../src/diagram/plantuml.js", () => ({ renderPlantUML: vi.fn(() => "/tmp/p.pdf") }));

import { prerenderDiagrams } from "../../src/diagram/pre-render.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { StyleConfig } from "../../src/sdk/types.js";

const style: StyleConfig = { $schema: "style-v1", tokens: {} };

describe("prerenderDiagrams fence matching", () => {
  it("renders a plain mermaid fence", async () => {
    const doc = parseMarkdownString("```mermaid\ngraph TD; A-->B\n```\n");
    const map = await prerenderDiagrams(doc, style, "/tmp/work");
    expect(map.size).toBe(1);
    expect([...map.values()][0]).toEqual({ pdfPath: "/tmp/m.pdf" });
  });

  it("captures a per-diagram maxheight from the fence info-string", async () => {
    const doc = parseMarkdownString("```mermaid maxheight=0.5\ngraph TD; A-->B\n```\n");
    const map = await prerenderDiagrams(doc, style, "/tmp/work");
    expect([...map.values()][0]).toEqual({ pdfPath: "/tmp/m.pdf", maxHeight: "0.5\\textheight" });
  });

  it("does NOT treat ```mermaidjs as a mermaid diagram", async () => {
    const doc = parseMarkdownString("```mermaidjs\ngraph TD; A-->B\n```\n");
    const map = await prerenderDiagrams(doc, style, "/tmp/work");
    expect(map.size).toBe(0);
  });
});
