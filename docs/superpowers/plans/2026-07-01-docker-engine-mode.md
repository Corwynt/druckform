# Docker Execution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `druck render` / `druck preview-component` run either locally (as today) or by relaying the whole command to the bundled Docker image, chosen automatically when local tools are missing and overridable via `--engine`/`DRUCK_ENGINE`; and refocus the skills on the CLI (remove MCP).

**Architecture:** A new `src/engine/` module: a tool prober, an engine resolver (`local`/`docker`/`auto`), a Docker relay (identity bind-mounts + `docker run`), and a `runWithEngine` orchestrator. `cli.ts` adds a global `--engine` option and routes the two tool-using command handlers through the orchestrator; pure commands are untouched.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22, yargs, vitest, Docker (mocked in tests).

## Global Constraints

- TypeScript ESM with `.js` import specifiers (NodeNext); match existing style.
- Engine precedence: `--engine` flag → `DRUCK_ENGINE` env → default `auto`. Values: `local | docker | auto`.
- Engine selection applies ONLY to `render` and `preview-component`. Pure commands (`templates`, `components`, `lint`, `doctor`, `new`, `mcp`) always run local.
- `auto`: probe `tectonic`, `rsvg-convert`, `mmdc`, `java`; print a found/missing report to **stderr**; **all present → local, any missing → docker**. `local` (forced): no probe, no report, fail lazily. `docker` (forced): no probe.
- Docker relay: rebuild argv with `--engine` stripped; identity-mount each unique parent dir (`-v /abs:/abs`) + `-w <cwd>`; forward `-e DRUCKFORM_TEMPLATES_DIR=<abs>` when set; `docker run --rm`; stream stdio (`inherit`); propagate exit code; report/Docker chatter to stderr (stdout stays clean for `--json`).
- Default image: `ghcr.io/druckform/druckform:<cli-version>` (version read from the package's own `package.json`), overridable via `DRUCK_DOCKER_IMAGE`.
- If Docker mode is selected but the `docker` binary is missing, print a clear message and exit non-zero.
- YAGNI: no Windows path-mapping polish (macOS/Linux first); no per-document tool subsetting; MCP server not removed (only dropped from skills).
- Run `pnpm biome check <changed files>` before each commit; branch stays lint-clean. Tests: `pnpm --filter druckform test` / `pnpm --filter druckform exec vitest run <path>`.

---

### Task 1: Tool prober

**Files:**
- Create: `packages/druckform/src/engine/probe-tools.ts`
- Test: `packages/druckform/tests/unit/probe-tools.test.ts`

**Interfaces:**
- Produces: `interface ToolStatus { tool: string; found: boolean; path?: string }`; `probeTools(resolve?: (cmd: string) => string | null): ToolStatus[]` (probes `tectonic`, `rsvg-convert`, `mmdc`, `java`); `formatReport(statuses: ToolStatus[], engine: "local" | "docker"): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/probe-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatReport, probeTools } from "../../src/engine/probe-tools.js";

describe("probeTools", () => {
  it("marks each tool found/missing via the injected resolver", () => {
    const resolve = (cmd: string) => (cmd === "tectonic" ? "/usr/local/bin/tectonic" : null);
    const s = probeTools(resolve);
    expect(s.map((x) => x.tool)).toEqual(["tectonic", "rsvg-convert", "mmdc", "java"]);
    expect(s.find((x) => x.tool === "tectonic")).toEqual({
      tool: "tectonic",
      found: true,
      path: "/usr/local/bin/tectonic",
    });
    expect(s.find((x) => x.tool === "mmdc")).toEqual({ tool: "mmdc", found: false });
  });
});

describe("formatReport", () => {
  it("renders a check/cross line per tool with the chosen engine", () => {
    const out = formatReport(
      [
        { tool: "tectonic", found: true, path: "/x/tectonic" },
        { tool: "mmdc", found: false },
      ],
      "docker",
    );
    expect(out).toContain("engine=auto → docker");
    expect(out).toContain("✓ tectonic");
    expect(out).toContain("/x/tectonic");
    expect(out).toContain("✗ mmdc");
    expect(out).toContain("not found");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/probe-tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/druckform/src/engine/probe-tools.ts`:

```ts
import { spawnSync } from "node:child_process";

export interface ToolStatus {
  tool: string;
  found: boolean;
  path?: string;
}

/** External tools druck shells out to during a render. */
const TOOLS = ["tectonic", "rsvg-convert", "mmdc", "java"] as const;

/** Default PATH resolver (macOS/Linux). Windows support is deferred. */
function whichSync(cmd: string): string | null {
  const res = spawnSync("which", [cmd], { encoding: "utf8" });
  if (res.status === 0 && typeof res.stdout === "string") {
    return res.stdout.trim().split("\n")[0] || null;
  }
  return null;
}

export function probeTools(resolve: (cmd: string) => string | null = whichSync): ToolStatus[] {
  return TOOLS.map((tool) => {
    const found = resolve(tool);
    return found ? { tool, found: true, path: found } : { tool, found: false };
  });
}

export function formatReport(statuses: ToolStatus[], engine: "local" | "docker"): string {
  const missing = statuses.some((s) => !s.found);
  const header = `druck: engine=auto → ${engine}${engine === "docker" && missing ? " (missing tools below)" : ""}`;
  const lines = statuses.map((s) =>
    s.found ? `  ✓ ${s.tool.padEnd(14)} ${s.path}` : `  ✗ ${s.tool.padEnd(14)} not found`,
  );
  return [header, ...lines].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/probe-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/engine/probe-tools.ts packages/druckform/tests/unit/probe-tools.test.ts
git add packages/druckform/src/engine/probe-tools.ts packages/druckform/tests/unit/probe-tools.test.ts
git commit -m "feat(druckform): external-tool prober + report (engine layer)"
```

---

### Task 2: Engine resolver

**Files:**
- Create: `packages/druckform/src/engine/resolve-engine.ts`
- Test: `packages/druckform/tests/unit/resolve-engine.test.ts`

**Interfaces:**
- Consumes: `probeTools`/`ToolStatus` (Task 1).
- Produces: `type EngineMode = "local" | "docker" | "auto"`; `type Engine = "local" | "docker"`; `resolveEngineMode(flag?: string, env?: string): EngineMode` (precedence + validation); `decideEngine(mode: EngineMode, probe?: () => ToolStatus[]): { engine: Engine; statuses?: ToolStatus[] }`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/resolve-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideEngine, resolveEngineMode } from "../../src/engine/resolve-engine.js";
import type { ToolStatus } from "../../src/engine/probe-tools.js";

describe("resolveEngineMode", () => {
  it("prefers flag over env over default auto", () => {
    expect(resolveEngineMode("docker", "local")).toBe("docker");
    expect(resolveEngineMode(undefined, "local")).toBe("local");
    expect(resolveEngineMode(undefined, undefined)).toBe("auto");
  });
  it("throws on an invalid value", () => {
    expect(() => resolveEngineMode("nonsense")).toThrow(/local \| docker \| auto/);
  });
});

describe("decideEngine", () => {
  const all: ToolStatus[] = [
    { tool: "tectonic", found: true },
    { tool: "rsvg-convert", found: true },
    { tool: "mmdc", found: true },
    { tool: "java", found: true },
  ];
  const someMissing: ToolStatus[] = [...all.slice(0, 3), { tool: "java", found: false }];

  it("forced local/docker skip probing", () => {
    let probed = false;
    const probe = () => {
      probed = true;
      return all;
    };
    expect(decideEngine("local", probe)).toEqual({ engine: "local" });
    expect(decideEngine("docker", probe)).toEqual({ engine: "docker" });
    expect(probed).toBe(false);
  });
  it("auto → local when all tools present", () => {
    expect(decideEngine("auto", () => all)).toEqual({ engine: "local", statuses: all });
  });
  it("auto → docker when any tool missing", () => {
    expect(decideEngine("auto", () => someMissing)).toEqual({
      engine: "docker",
      statuses: someMissing,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/resolve-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/druckform/src/engine/resolve-engine.ts`:

```ts
import { probeTools, type ToolStatus } from "./probe-tools.js";

export type EngineMode = "local" | "docker" | "auto";
export type Engine = "local" | "docker";

export function resolveEngineMode(flag?: string, env?: string): EngineMode {
  const raw = flag ?? env ?? "auto";
  if (raw !== "local" && raw !== "docker" && raw !== "auto") {
    throw new Error(`Invalid engine '${raw}'. Use local | docker | auto.`);
  }
  return raw;
}

export function decideEngine(
  mode: EngineMode,
  probe: () => ToolStatus[] = probeTools,
): { engine: Engine; statuses?: ToolStatus[] } {
  if (mode === "local") return { engine: "local" };
  if (mode === "docker") return { engine: "docker" };
  const statuses = probe();
  const engine: Engine = statuses.every((s) => s.found) ? "local" : "docker";
  return { engine, statuses };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/resolve-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/engine/resolve-engine.ts packages/druckform/tests/unit/resolve-engine.test.ts
git add packages/druckform/src/engine/resolve-engine.ts packages/druckform/tests/unit/resolve-engine.test.ts
git commit -m "feat(druckform): engine resolver (local/docker/auto precedence + decision)"
```

---

### Task 3: Docker relay (image, mounts, arg-builder, runner)

**Files:**
- Create: `packages/druckform/src/engine/docker-relay.ts`
- Test: `packages/druckform/tests/unit/docker-relay.test.ts`

**Interfaces:**
- Produces:
  - `resolveVersion(): string` and `defaultImage(): string` (→ `ghcr.io/druckform/druckform:<version>`).
  - `stripEngineFlag(args: string[]): string[]`.
  - `interface MountSpec { cwd: string; in?: string; out?: string; assets?: string; style?: string; templatesDir?: string }`; `collectMountDirs(m: MountSpec): string[]` (absolute, deduped).
  - `interface DockerArgsSpec { passthrough: string[]; cwd: string; mountDirs: string[]; templatesDir?: string; image: string }`; `buildDockerArgs(s: DockerArgsSpec): string[]`.
  - `relayToDocker(s: DockerArgsSpec, spawn?): number`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/docker-relay.test.ts`:

```ts
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
  it("targets ghcr.io/druckform/druckform at the package version", () => {
    expect(defaultImage()).toMatch(/^ghcr\.io\/druckform\/druckform:\d+\.\d+\.\d+/);
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
      image: "ghcr.io/druckform/druckform:0.1.0",
    });
    expect(args.slice(0, 4)).toEqual(["run", "--rm", "-w", "/work/proj"]);
    expect(args).toContain("-v");
    expect(args.join(" ")).toContain("/work/proj:/work/proj");
    expect(args.join(" ")).toContain("/etc/styles:/etc/styles");
    expect(args.join(" ")).toContain("-e DRUCKFORM_TEMPLATES_DIR=/opt/tpl");
    const imgIdx = args.indexOf("ghcr.io/druckform/druckform:0.1.0");
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/docker-relay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/druckform/src/engine/docker-relay.ts`:

```ts
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
      if (pkg.name === "druckform" && pkg.version) return pkg.version;
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
  in?: string;
  out?: string;
  assets?: string;
  style?: string;
  templatesDir?: string;
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/docker-relay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/engine/docker-relay.ts packages/druckform/tests/unit/docker-relay.test.ts
git add packages/druckform/src/engine/docker-relay.ts packages/druckform/tests/unit/docker-relay.test.ts
git commit -m "feat(druckform): docker relay (image, identity mounts, arg-builder, runner)"
```

---

### Task 4: `runWithEngine` orchestrator

**Files:**
- Create: `packages/druckform/src/engine/run.ts`
- Test: `packages/druckform/tests/unit/run-engine.test.ts`

**Interfaces:**
- Consumes: `resolveEngineMode`/`decideEngine` (Task 2), `formatReport` (Task 1), `collectMountDirs`/`buildDockerArgs`/`relayToDocker`/`defaultImage`/`stripEngineFlag` (Task 3).
- Produces:
  ```ts
  interface RunEngineOpts {
    engineFlag?: string;                 // argv.engine
    rawArgs: string[];                   // hideBin(process.argv)
    paths: { in?: string; out?: string; assets?: string; style?: string };
    local: () => Promise<void>;          // the existing command handler
    deps?: { /* injected for tests */ };
  }
  runWithEngine(opts: RunEngineOpts): Promise<void>
  ```
  On `docker` it relays and calls `process.exit(code)`; on `local` it awaits `local()`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/run-engine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runWithEngine } from "../../src/engine/run.js";
import type { ToolStatus } from "../../src/engine/probe-tools.js";

const allFound: ToolStatus[] = [
  { tool: "tectonic", found: true },
  { tool: "rsvg-convert", found: true },
  { tool: "mmdc", found: true },
  { tool: "java", found: true },
];
const missing: ToolStatus[] = [...allFound.slice(0, 3), { tool: "java", found: false }];

describe("runWithEngine", () => {
  it("runs the local handler when engine resolves local (forced)", async () => {
    const local = vi.fn(async () => {});
    const spawn = vi.fn();
    await runWithEngine({
      engineFlag: "local",
      rawArgs: ["render", "--engine", "local", "--in", "d.md", "--out", "o.pdf"],
      paths: { in: "d.md", out: "o.pdf" },
      local,
      deps: { probe: () => allFound, spawn, exit: () => {}, cwd: "/w", env: {} },
    });
    expect(local).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("relays to docker (stripping --engine) and exits with its code when auto detects a missing tool", async () => {
    const local = vi.fn(async () => {});
    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const exit = vi.fn();
    await runWithEngine({
      engineFlag: undefined, // auto
      rawArgs: ["render", "--in", "d.md", "--out", "o.pdf"],
      paths: { in: "d.md", out: "o.pdf" },
      local,
      deps: { probe: () => missing, spawn, exit, cwd: "/w", env: {} },
    });
    expect(local).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledOnce();
    const [cmd, args] = spawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("docker");
    expect(args).not.toContain("--engine");
    expect(args.slice(-4)).toEqual(["render", "--in", "d.md", "--out", "o.pdf"]);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/run-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/druckform/src/engine/run.ts`:

```ts
import type { spawnSync } from "node:child_process";
import { formatReport, probeTools, type ToolStatus } from "./probe-tools.js";
import { decideEngine, resolveEngineMode } from "./resolve-engine.js";
import {
  buildDockerArgs,
  collectMountDirs,
  defaultImage,
  relayToDocker,
  stripEngineFlag,
} from "./docker-relay.js";

export interface RunEngineOpts {
  engineFlag?: string;
  rawArgs: string[];
  paths: { in?: string; out?: string; assets?: string; style?: string };
  local: () => Promise<void>;
  deps?: {
    probe?: () => ToolStatus[];
    spawn?: typeof spawnSync;
    exit?: (code: number) => void;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stderr?: (s: string) => void;
  };
}

export async function runWithEngine(opts: RunEngineOpts): Promise<void> {
  const d = opts.deps ?? {};
  const env = d.env ?? process.env;
  const cwd = d.cwd ?? process.cwd();
  const exit = d.exit ?? ((code: number) => process.exit(code));
  const stderr = d.stderr ?? ((s: string) => void process.stderr.write(s));

  const mode = resolveEngineMode(opts.engineFlag, env.DRUCK_ENGINE);
  const { engine, statuses } = decideEngine(mode, d.probe ?? probeTools);
  if (mode === "auto" && statuses) stderr(`${formatReport(statuses, engine)}\n`);

  if (engine === "docker") {
    const templatesDir = env.DRUCKFORM_TEMPLATES_DIR;
    const mountDirs = collectMountDirs({ cwd, ...opts.paths, ...(templatesDir ? { templatesDir } : {}) });
    const image = env.DRUCK_DOCKER_IMAGE ?? defaultImage();
    const spec = {
      passthrough: stripEngineFlag(opts.rawArgs),
      cwd,
      mountDirs,
      ...(templatesDir ? { templatesDir } : {}),
      image,
    };
    const code = relayToDocker(spec, d.spawn);
    exit(code);
    return;
  }
  await opts.local();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/run-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/engine/run.ts packages/druckform/tests/unit/run-engine.test.ts
git add packages/druckform/src/engine/run.ts packages/druckform/tests/unit/run-engine.test.ts
git commit -m "feat(druckform): runWithEngine orchestrator (report + relay-or-local)"
```

---

### Task 5: Wire the engine into `cli.ts`

**Files:**
- Modify: `packages/druckform/src/cli.ts`

**Interfaces:**
- Consumes: `runWithEngine` (Task 4).

- [ ] **Step 1: Add the global `--engine` option + import**

In `packages/druckform/src/cli.ts`, add the import near the top:

```ts
import { hideBin } from "yargs/helpers";
import { runWithEngine } from "./engine/run.js";
```

(`hideBin` is already imported — do not duplicate.) On the main yargs chain (after `.usage(...)`, before the first `.command(...)`), add a global option:

```ts
  .option("engine", {
    choices: ["local", "docker", "auto"] as const,
    describe: "Execution engine: run locally, in Docker, or auto-detect (default auto)",
  })
```

- [ ] **Step 2: Route the `render` handler through the engine**

Replace the `render` command handler body:

```ts
    async (argv) => {
      await runWithEngine({
        engineFlag: argv.engine,
        rawArgs: hideBin(process.argv),
        paths: { in: argv.in, out: argv.out, assets: argv.assets, style: argv.style },
        local: () => renderCommand(argv.template, argv.style, argv.in, argv.assets, argv.out, argv.json),
      });
    },
```

- [ ] **Step 3: Route the `preview-component` handler through the engine**

Replace the `preview-component` command handler body:

```ts
    async (argv) => {
      await runWithEngine({
        engineFlag: argv.engine,
        rawArgs: hideBin(process.argv),
        paths: { out: argv.out, style: argv.style },
        local: () =>
          previewComponentCommand(
            argv.template,
            argv.name,
            argv.params,
            argv.children,
            argv.style,
            argv.out,
            argv.json,
            argv.watch,
          ),
      });
    },
```

- [ ] **Step 4: Typecheck, build, and smoke-test**

Run: `pnpm --filter druckform test`
Expected: PASS (existing command tests unaffected — they call the command functions directly; the engine layer is exercised by its own unit tests).

Run: `pnpm --filter druckform build`
Expected: build success.

Smoke (local path — no Docker needed; requires the local tools OR forced local): with tools installed,
`node packages/druckform/dist/cli.js render --template base --in <a.md> --assets <dir> --out /tmp/x.pdf --engine local` renders as before.
Forced-docker arg construction (no real render) can be eyeballed with a fake docker on PATH, but is already covered by the Task 3/4 unit tests.

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/cli.ts
git add packages/druckform/src/cli.ts
git commit -m "feat(druckform): --engine option; route render/preview through the engine layer"
```

---

### Task 6: Guiding "tool not found" errors for local renders

The spec requires forced-`local` renders to fail lazily with a message pointing at Docker. Make the external-tool spawn sites detect a missing binary (ENOENT) and throw a clear, actionable error.

**Files:**
- Create: `packages/druckform/src/engine/tool-error.ts`
- Modify: `packages/druckform/src/latex/tectonic.ts`, `packages/druckform/src/diagram/mermaid.ts`, `packages/druckform/src/diagram/plantuml.ts`
- Test: `packages/druckform/tests/unit/tool-error.test.ts`

**Interfaces:**
- Produces: `missingToolError(tool: string): Error` — message names the tool and the `DRUCK_ENGINE=docker` escape.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/tool-error.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { missingToolError } from "../../src/engine/tool-error.js";

describe("missingToolError", () => {
  it("names the tool and the docker escape hatch", () => {
    const e = missingToolError("tectonic");
    expect(e.message).toContain("tectonic");
    expect(e.message).toContain("DRUCK_ENGINE=docker");
  });
});

describe("tectonic ENOENT", () => {
  it("throws the guiding error when the tectonic binary is missing", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ error: Object.assign(new Error("x"), { code: "ENOENT" }), status: null }),
    }));
    const { runTectonic } = await import("../../src/latex/tectonic.js");
    expect(() => runTectonic("/tmp/doc.tex", "/tmp/out.pdf")).toThrow(/tectonic.*DRUCK_ENGINE=docker/s);
    vi.doUnmock("node:child_process");
    vi.resetModules();
  });
});
```

> Confirm `runTectonic`'s exact signature/exports by reading `src/latex/tectonic.ts` first (it is imported by `render.ts` as `runTectonic`). Adjust the call in the test to match its real parameters.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/tool-error.test.ts`
Expected: FAIL — module `tool-error.js` not found (and tectonic doesn't yet special-case ENOENT).

- [ ] **Step 3: Implement the helper**

Create `packages/druckform/src/engine/tool-error.ts`:

```ts
/** Error for a missing external render tool, pointing at the Docker escape hatch. */
export function missingToolError(tool: string): Error {
  return new Error(
    `'${tool}' not found — install it, or set DRUCK_ENGINE=docker (or pass --engine docker) to render in the bundled container.`,
  );
}
```

- [ ] **Step 4: Wire ENOENT detection into each tool site**

In each of the three files, immediately after the relevant `spawnSync(...)` call, before the existing `status !== 0` check, add an ENOENT branch. Read each file first; the pattern is:

`packages/druckform/src/latex/tectonic.ts` — after the `tectonic` spawn:
```ts
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw missingToolError("tectonic");
  }
```

`packages/druckform/src/diagram/mermaid.ts` — after the `mmdc` spawn add `throw missingToolError("mmdc")` on ENOENT; after the `rsvg-convert` spawn add `throw missingToolError("rsvg-convert")` on ENOENT.

`packages/druckform/src/diagram/plantuml.ts` — after the `java` spawn add `throw missingToolError("java (for PlantUML)")` on ENOENT; after the `rsvg-convert` spawn add `throw missingToolError("rsvg-convert")` on ENOENT.

Add `import { missingToolError } from "../engine/tool-error.js";` to each (path is `../engine/...` from `src/latex` and `src/diagram`).

- [ ] **Step 5: Run to verify it passes + full suite**

Run: `pnpm --filter druckform exec vitest run tests/unit/tool-error.test.ts`
Expected: PASS.
Run: `pnpm --filter druckform test`
Expected: PASS (existing diagram/render tests mock `spawnSync` with `status: 0` and no `error`, so the new ENOENT branch doesn't trigger).

- [ ] **Step 6: Commit**

```bash
pnpm biome check packages/druckform/src/engine/tool-error.ts packages/druckform/src/latex/tectonic.ts packages/druckform/src/diagram/mermaid.ts packages/druckform/src/diagram/plantuml.ts packages/druckform/tests/unit/tool-error.test.ts
git add packages/druckform/src/engine/tool-error.ts packages/druckform/src/latex/tectonic.ts packages/druckform/src/diagram/mermaid.ts packages/druckform/src/diagram/plantuml.ts packages/druckform/tests/unit/tool-error.test.ts
git commit -m "feat(druckform): guiding 'tool not found → try docker' errors for local renders"
```

---

### Task 7: Skills (CLI-first, drop MCP) + engine docs

Pure documentation. Refocus the skills on the CLI and document the engine model. No unit tests; verify claims against the shipped engine code.

**Files:**
- Modify: `claude-plugin/skills/druckform/SKILL.md`
- Modify: `claude-plugin/skills/druckform-authoring/SKILL.md`
- Modify: `docs/extending-druckform.md`

**Prerequisite:** read `src/engine/run.ts`, `src/engine/resolve-engine.ts`, `src/engine/docker-relay.ts` so the documented flags/behavior match.

- [ ] **Step 1: Rewrite the `druckform` skill to CLI-first, remove MCP**

In `claude-plugin/skills/druckform/SKILL.md`: replace the MCP-tool tables/workflow with the equivalent `druck` CLI commands (`druck templates`, `druck components -t <t> --json`, `druck render -t <t> --style <s> --in <md> --assets <dir> --out <pdf>`, `druck preview-component …`). Remove the `list_components`/`render_document`/`render_markdown`/`preview_component`/job MCP tool documentation from the skill body.

- [ ] **Step 2: Document the engine model in the skill**

Add a short "Execution engines" section: `druck` runs the render locally if the tools (`tectonic`, `rsvg-convert`, `mmdc`, `java`) are present, otherwise automatically in Docker (`ghcr.io/druckform/druckform:<version>`); force it with `--engine local|docker` or `DRUCK_ENGINE`; override the image with `DRUCK_DOCKER_IMAGE`. Note the auto boot report prints to stderr. Applies to `render`/`preview-component` only.

- [ ] **Step 3: Rewrite the `druckform-authoring` skill's CLI↔MCP table**

In `claude-plugin/skills/druckform-authoring/SKILL.md`: drop the MCP column/tool references (`validate_component`, `scaffold_component`, `preview_component`, `list_components`) from the workflow; present the `druck` commands as the path (`druck doctor`, `druck preview-component`, `druck new component|template`, `druck components`). Keep the authoring contract content intact.

- [ ] **Step 4: Docs — engine model + brief MCP mention**

In `docs/extending-druckform.md`: add an "Execution engines" subsection documenting `--engine`/`DRUCK_ENGINE`/`DRUCK_DOCKER_IMAGE`, the auto rule (all tools present → local, any missing → docker), the stderr boot report, that it applies to `render`/`preview-component`, and the identity-mount behavior for paths. Keep the existing MCP section, but add a one-line note that the CLI is the primary interface and the MCP server is an optional alternative for host integrations.

- [ ] **Step 5: Verify + commit**

- `grep -rn "list_components\|render_markdown\|render_document\|preview_component\|validate_component\|scaffold_component" claude-plugin/skills` → should return nothing (MCP tools no longer referenced in the skills).
- Confirm documented flags/env names match the code (`--engine`, `DRUCK_ENGINE`, `DRUCK_DOCKER_IMAGE`, image `ghcr.io/druckform/druckform`).
- biome does not process `.md` (no-op) — skip.

```bash
git add claude-plugin/skills/druckform/SKILL.md claude-plugin/skills/druckform-authoring/SKILL.md docs/extending-druckform.md
git commit -m "docs(druckform): CLI-first skills (drop MCP) + execution-engine docs"
```

---

## Notes for the implementer

- **Task order 1→7.** Tasks 1–3 are independent pure modules; Task 4 composes them; Task 5 is thin cli glue; Task 6 adds the local-mode "tool not found → try docker" hints at the spawn sites; Task 7 is docs.
- **The engine layer is fully unit-tested via dependency injection** (`deps` in `runWithEngine`, `spawn`/`probe`/`resolve` params). No test spawns real `docker`/`which`. cli.ts wiring is thin and covered by typecheck + build; the existing render/preview tests still call the command functions directly (local path), which is fine.
- **Identity mounts** mean the passed-through args need no rewriting — relative paths resolve against `-w <cwd>` (cwd is mounted), absolute paths resolve against their mounted parents.
- **`--json` stays clean:** the auto report and Docker output go to stderr; only the command's own JSON goes to stdout.
- **Keep the branch biome-clean** — run `pnpm biome check` before each commit.
```
