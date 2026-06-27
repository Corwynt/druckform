import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface TectonicResult {
  ok: boolean;
  log: string;
}

export function runTectonic(texPath: string, outputPdf: string): TectonicResult {
  const logPath = outputPdf.replace(/\.pdf$/, ".log");

  const result = spawnSync(
    "tectonic",
    [
      "--keep-logs",
      "--untrusted-input", // disables shell-escape
      "--outfmt",
      "pdf",
      "--outdir",
      path.dirname(outputPdf),
      texPath,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );

  const log = (result.stdout ?? "") + (result.stderr ?? "");

  // Write full log to disk for human debugging
  fs.writeFileSync(logPath, log, "utf8");

  return {
    ok: result.status === 0,
    log,
  };
}
