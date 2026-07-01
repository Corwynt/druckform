import type { spawnSync } from "node:child_process";
import { collectMountDirs, defaultImage, relayToDocker, stripEngineFlag } from "./docker-relay.js";
import { type ToolStatus, formatReport, probeTools } from "./probe-tools.js";
import { decideEngine, resolveEngineMode } from "./resolve-engine.js";

export interface RunEngineOpts {
  engineFlag?: string | undefined;
  rawArgs: string[];
  paths: {
    in?: string | undefined;
    out?: string | undefined;
    assets?: string | undefined;
    style?: string | undefined;
  };
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
    const mountDirs = collectMountDirs({
      cwd,
      ...opts.paths,
      ...(templatesDir ? { templatesDir } : {}),
    });
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
