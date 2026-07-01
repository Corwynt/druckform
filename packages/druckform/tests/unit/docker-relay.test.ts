import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDockerArgs,
  collectMountDirs,
  defaultImage,
  relayToDocker,
  stripEngineFlag,
} from "../../src/engine/docker-relay.js";

describe("stripEngineFlag", () => {
  it("removes --engine <val> and --engine=<val>", () => {
    expect(stripEngineFlag(["render", "--engine", "docker", "--in", "d.md"])).toEqual([
      "render",
      "--in",
      "d.md",
    ]);
    expect(stripEngineFlag(["render", "--engine=local", "--out", "o.pdf"])).toEqual([
      "render",
      "--out",
      "o.pdf",
    ]);
  });
});

describe("defaultImage", () => {
  it("targets ghcr.io/corwynt/druckform at the package version", () => {
    expect(defaultImage()).toMatch(/^ghcr\.io\/corwynt\/druckform:\d+\.\d+\.\d+/);
  });
});

describe("collectMountDirs", () => {
  it("mounts cwd, file parents, and dir paths (deduped, absolute)", () => {
    const cwd = "/work/proj";
    const dirs = collectMountDirs({
      cwd,
      in: "doc.md", // → parent /work/proj (== cwd)
      out: "out/x.pdf", // → parent /work/proj/out
      style: "/etc/styles/s.yaml", // → parent /etc/styles
      assets: "assets", // dir → /work/proj/assets
      templatesDir: "/opt/tpl", // dir → /opt/tpl
    });
    expect(dirs).toContain("/work/proj");
    expect(dirs).toContain("/work/proj/out");
    expect(dirs).toContain("/etc/styles");
    expect(dirs).toContain("/work/proj/assets");
    expect(dirs).toContain("/opt/tpl");
    expect(new Set(dirs).size).toBe(dirs.length); // deduped
  });
});

describe("buildDockerArgs", () => {
  it("builds docker run with identity mounts, -w, env, image, passthrough", () => {
    const args = buildDockerArgs({
      passthrough: ["render", "--in", "doc.md", "--out", "o.pdf"],
      cwd: "/work/proj",
      mountDirs: ["/work/proj", "/etc/styles"],
      templatesDir: "/opt/tpl",
      image: "ghcr.io/corwynt/druckform:0.1.0",
    });
    expect(args.slice(0, 4)).toEqual(["run", "--rm", "-w", "/work/proj"]);
    expect(args).toContain("-v");
    expect(args.join(" ")).toContain("/work/proj:/work/proj");
    expect(args.join(" ")).toContain("/etc/styles:/etc/styles");
    expect(args.join(" ")).toContain("-e DRUCKFORM_TEMPLATES_DIR=/opt/tpl");
    const imgIdx = args.indexOf("ghcr.io/corwynt/druckform:0.1.0");
    expect(imgIdx).toBeGreaterThan(0);
    expect(args.slice(imgIdx + 1)).toEqual(["render", "--in", "doc.md", "--out", "o.pdf"]);
  });
  it("omits the -e flag when no templatesDir", () => {
    const args = buildDockerArgs({
      passthrough: ["render"],
      cwd: "/w",
      mountDirs: ["/w"],
      image: "img",
    });
    expect(args.join(" ")).not.toContain("DRUCKFORM_TEMPLATES_DIR");
  });
});

describe("relayToDocker", () => {
  it("returns the docker exit code", () => {
    const spawn = (() => ({ status: 3 })) as never;
    expect(
      relayToDocker({ passthrough: ["render"], cwd: "/w", mountDirs: ["/w"], image: "img" }, spawn),
    ).toBe(3);
  });
  it("returns 127 with a clear message when docker is missing", () => {
    const spawn = (() => ({ error: Object.assign(new Error("x"), { code: "ENOENT" }) })) as never;
    expect(
      relayToDocker({ passthrough: ["render"], cwd: "/w", mountDirs: ["/w"], image: "img" }, spawn),
    ).toBe(127);
  });
});
