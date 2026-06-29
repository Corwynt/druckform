import { describe, expect, it } from "vitest";
import { mergeStyle } from "../../src/style/merge.js";

describe("mergeStyle", () => {
  it("deep-merges tokens with over winning per key", () => {
    const base = {
      $schema: "style-v1",
      tokens: { colors: { accent: "#111111", warning: "#222222" } },
    };
    const over = {
      $schema: "style-v1",
      tokens: { colors: { accent: "#999999" }, spacing: { gap: "1em" } },
    };
    expect(mergeStyle(base, over)).toEqual({
      $schema: "style-v1",
      tokens: {
        colors: { accent: "#999999", warning: "#222222" },
        fonts: {},
        spacing: { gap: "1em" },
      },
    });
  });

  it("returns a normalized empty style when both are undefined", () => {
    expect(mergeStyle(undefined, undefined)).toEqual({
      $schema: "style-v1",
      tokens: { colors: {}, fonts: {}, spacing: {} },
    });
  });
});
