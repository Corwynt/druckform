import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
}));

import { spawnSync } from "node:child_process";
import { renderMermaid } from "../../src/diagram/mermaid.js";
import type { StyleConfig } from "../../src/sdk/types.js";

let workDir: string;
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-mmd-"));
  vi.mocked(spawnSync).mockClear();
});
afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }));

function mmdcArgs(): string[] {
  const call = vi.mocked(spawnSync).mock.calls.find((c) => c[0] === "mmdc");
  if (!call) throw new Error("mmdc was not invoked");
  return call[1] as string[];
}
function readConfig(): Record<string, unknown> {
  const cfgPath = path.join(workDir, "mermaid-0.config.json");
  return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
}

const baseStyle: StyleConfig = { $schema: "style-v1", tokens: {} };

describe("renderMermaid config", () => {
  it("always disables htmlLabels so librsvg keeps the text", () => {
    renderMermaid("graph TD; A-->B", baseStyle, workDir, 0);
    const cfg = readConfig();
    expect(cfg.htmlLabels).toBe(false);
    expect((cfg.flowchart as Record<string, unknown>).htmlLabels).toBe(false);
    expect(mmdcArgs()).toContain("-c");
  });

  it("passes -t <theme> and omits config.theme when no themeVariables", () => {
    const style: StyleConfig = {
      $schema: "style-v1",
      tokens: {},
      diagrams: { mermaid: { theme: "forest" } },
    };
    renderMermaid("graph TD; A-->B", style, workDir, 0);
    expect(mmdcArgs()).toEqual(expect.arrayContaining(["-t", "forest"]));
    expect(readConfig().theme).toBeUndefined();
  });

  it("forces theme:base + themeVariables in config and drops -t when inline vars are set", () => {
    const style: StyleConfig = {
      $schema: "style-v1",
      tokens: {},
      diagrams: {
        mermaid: {
          theme: "default",
          themeVariables: { primaryColor: "#FFE7D1", lineColor: "#FF6b00" },
        },
      },
    };
    renderMermaid("graph TD; A-->B", style, workDir, 0);
    const cfg = readConfig();
    expect(cfg.theme).toBe("base");
    expect((cfg.themeVariables as Record<string, string>).lineColor).toBe("#FF6b00");
    expect(mmdcArgs()).not.toContain("-t");
  });

  it("loads themeVariablesRef from styleDir when no inline vars", () => {
    const styleDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-styledir-"));
    fs.writeFileSync(path.join(styleDir, "brand.json"), JSON.stringify({ lineColor: "#123456" }));
    const style: StyleConfig = {
      $schema: "style-v1",
      tokens: {},
      diagrams: { mermaid: { themeVariablesRef: "brand.json" } },
    };
    renderMermaid("graph TD; A-->B", style, workDir, 0, styleDir);
    const cfg = readConfig();
    expect(cfg.theme).toBe("base");
    expect((cfg.themeVariables as Record<string, string>).lineColor).toBe("#123456");
    fs.rmSync(styleDir, { recursive: true, force: true });
  });

  it("treats empty themeVariables like no themeVariables — passes -t <theme> and omits config.theme", () => {
    const style: StyleConfig = {
      $schema: "style-v1",
      tokens: {},
      diagrams: { mermaid: { theme: "forest", themeVariables: {} } },
    };
    renderMermaid("graph TD; A-->B", style, workDir, 0);
    expect(mmdcArgs()).toEqual(expect.arrayContaining(["-t", "forest"]));
    expect(readConfig().theme).toBeUndefined();
  });
});
