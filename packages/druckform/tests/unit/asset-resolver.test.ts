import type { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertSvgToPdf, createAssetResolver } from "../../src/sdk/asset-resolver.js";

let dir: string;
let workDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-asset-tpl-"));
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-asset-work-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("createAssetResolver", () => {
  it("returns the absolute path for a non-SVG asset that exists", () => {
    fs.writeFileSync(path.join(dir, "logo.pdf"), "%PDF-1.4");
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map() });
    expect(asset("logo.pdf")).toBe(path.join(dir, "logo.pdf"));
  });

  it("throws a clear error when the asset is missing", () => {
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map() });
    expect(() => asset("nope.pdf")).toThrow(/not found/i);
  });

  it("rejects path traversal", () => {
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map() });
    expect(() => asset("../secret.pdf")).toThrow(/escapes/);
  });

  it("converts an SVG and returns a workDir PDF path", () => {
    fs.writeFileSync(path.join(dir, "logo.svg"), "<svg/>");
    const convertSvg = vi.fn((_svg: string, out: string) => fs.writeFileSync(out, "%PDF"));
    const asset = createAssetResolver({ templateDir: dir, workDir, cache: new Map(), convertSvg });
    const out = asset("logo.svg");
    expect(out).toBe(path.join(workDir, "asset-0.pdf"));
    expect(convertSvg).toHaveBeenCalledOnce();
    expect(convertSvg).toHaveBeenCalledWith(path.join(dir, "logo.svg"), out);
  });

  it("memoizes conversion across repeated refs (converts once)", () => {
    fs.writeFileSync(path.join(dir, "logo.svg"), "<svg/>");
    const convertSvg = vi.fn((_svg: string, out: string) => fs.writeFileSync(out, "%PDF"));
    const cache = new Map<string, string>();
    const asset = createAssetResolver({ templateDir: dir, workDir, cache, convertSvg });
    const a = asset("logo.svg");
    const b = asset("logo.svg");
    expect(a).toBe(b);
    expect(convertSvg).toHaveBeenCalledOnce();
  });
});

describe("convertSvgToPdf", () => {
  it("throws an actionable error when rsvg-convert is missing (ENOENT)", () => {
    const fakeSpawn = (() => ({
      error: Object.assign(new Error("x"), { code: "ENOENT" }),
    })) as unknown as typeof spawnSync;
    expect(() => convertSvgToPdf("/a.svg", "/b.pdf", fakeSpawn)).toThrow(/rsvg-convert/);
  });

  it("throws when conversion exits non-zero", () => {
    const fakeSpawn = (() => ({ status: 1, stderr: "boom" })) as unknown as typeof spawnSync;
    expect(() => convertSvgToPdf("/a.svg", "/b.pdf", fakeSpawn)).toThrow(/conversion failed/i);
  });
});
