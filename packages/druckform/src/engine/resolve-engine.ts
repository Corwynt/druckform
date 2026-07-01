import { type ToolStatus, probeTools } from "./probe-tools.js";

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
