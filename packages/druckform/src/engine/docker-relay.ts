import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Read this package's own version. Dual-path: src/engine (tests) and bundled dist/ (cli). */
export function resolveVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(dir, "../../package.json"), // src/engine → <pkg>/package.json
    path.resolve(dir, "../package.json"), // dist/ (bundled cli.js) → <pkg>/package.json
  ];
  for (const c of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(c, "utf8")) as { name?: string; version?: string };
      if (pkg.name === "@druckform/core" && pkg.version) return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return "latest";
}

export function defaultImage(): string {
  return `ghcr.io/druckform/druckform:${resolveVersion()}`;
}

export function stripEngineFlag(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--engine") {
      i++; // also skip its value
      continue;
    }
    if (a.startsWith("--engine=")) continue;
    out.push(a);
  }
  return out;
}

export interface MountSpec {
  cwd: string;
  in?: string | undefined;
  out?: string | undefined;
  assets?: string | undefined;
  style?: string | undefined;
  templatesDir?: string | undefined;
}

/** Absolute, deduped directories to bind-mount identically into the container. */
export function collectMountDirs(m: MountSpec): string[] {
  const dirs = new Set<string>([path.resolve(m.cwd)]);
  const fileParent = (p?: string) => {
    if (p) dirs.add(path.dirname(path.resolve(m.cwd, p)));
  };
  const dir = (p?: string) => {
    if (p) dirs.add(path.resolve(m.cwd, p));
  };
  fileParent(m.in);
  fileParent(m.out);
  fileParent(m.style);
  dir(m.assets);
  dir(m.templatesDir);
  return [...dirs];
}

export interface DockerArgsSpec {
  passthrough: string[];
  cwd: string;
  mountDirs: string[];
  templatesDir?: string;
  image: string;
}

export function buildDockerArgs(s: DockerArgsSpec): string[] {
  const args = ["run", "--rm", "-w", s.cwd];
  for (const d of s.mountDirs) args.push("-v", `${d}:${d}`);
  if (s.templatesDir) {
    args.push("-e", `DRUCKFORM_TEMPLATES_DIR=${path.resolve(s.cwd, s.templatesDir)}`);
  }
  args.push(s.image, ...s.passthrough);
  return args;
}

export function relayToDocker(s: DockerArgsSpec, spawn: typeof spawnSync = spawnSync): number {
  const res = spawn("docker", buildDockerArgs(s), { stdio: "inherit" });
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    process.stderr.write(
      "druck: 'docker' not found — install Docker, or set DRUCK_ENGINE=local and install the render tools.\n",
    );
    return 127;
  }
  return res.status ?? 1;
}
