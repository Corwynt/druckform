import { describe, expect, it } from "vitest";
import { parseMarkdownString } from "../../src/parse/parser.js";

describe("frontmatter parsing", () => {
  it("extracts leading --- frontmatter and keeps the body", () => {
    const doc = parseMarkdownString("---\ntitle: Hello\ntemplate: report\n---\n# Heading\n");
    expect(doc.frontmatter).toEqual({ title: "Hello", template: "report" });
    expect(doc.nodes.some((n) => n.type === "text" && n.content.includes("# Heading"))).toBe(true);
  });

  it("preserves body source-line numbers (body after frontmatter)", () => {
    // frontmatter occupies lines 1-3; the heading is on line 4
    const doc = parseMarkdownString("---\ntitle: X\n---\n# Heading\n");
    const text = doc.nodes.find((n) => n.type === "text");
    expect(text && text.type === "text" ? text.sourceLine : -1).toBe(4);
  });

  it("treats a leading --- with no close as ordinary content (no frontmatter)", () => {
    const doc = parseMarkdownString("---\njust text\nmore");
    expect(doc.frontmatter).toEqual({});
  });

  it("returns empty frontmatter when absent", () => {
    expect(parseMarkdownString("# Heading").frontmatter).toEqual({});
  });
});
