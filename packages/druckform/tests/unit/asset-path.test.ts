import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAssetPath } from "../../src/sdk/asset-path.js";

const ROOT = "/work/assets";

describe("resolveAssetPath", () => {
  it("returns resolved path for a normal ref", () => {
    expect(resolveAssetPath(ROOT, "images/photo.png")).toBe(
      path.resolve(ROOT, "images/photo.png")
    );
  });

  it("throws on path traversal with ../", () => {
    expect(() => resolveAssetPath(ROOT, "../secret.txt")).toThrow("escapes");
  });

  it("throws on double ../ traversal", () => {
    expect(() => resolveAssetPath(ROOT, "images/../../etc/passwd")).toThrow("escapes");
  });

  it("throws on absolute path ref", () => {
    expect(() => resolveAssetPath(ROOT, "/etc/passwd")).toThrow("must be relative");
  });

  it("allows nested paths that stay inside root", () => {
    expect(resolveAssetPath(ROOT, "a/b/c/file.svg")).toBe(
      path.resolve(ROOT, "a/b/c/file.svg")
    );
  });
});
