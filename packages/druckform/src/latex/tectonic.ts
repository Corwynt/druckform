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
      "--untrusted", // disables shell-escape (tectonic 0.15.0 flag name)
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

  const ok = result.status === 0;

  // Tectonic names its output after the input stem (e.g. document.tex -> document.pdf)
  // and ignores the requested --out filename. Rename to the requested path so callers
  // (and the MCP finalize/download step) find the PDF where they expect it.
  if (ok) {
    const produced = path.join(
      path.dirname(outputPdf),
      `${path.basename(texPath, path.extname(texPath))}.pdf`,
    );
    if (produced !== outputPdf) {
      fs.renameSync(produced, outputPdf);
    }
  }

  return {
    ok,
    log,
  };
}
