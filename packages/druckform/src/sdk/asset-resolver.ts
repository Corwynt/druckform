import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveAssetPath } from "./asset-path.js";

type SpawnFn = typeof spawnSync;

/**
 * Convert an SVG file to a vector PDF via `rsvg-convert` — the same binary the
 * diagram pipeline already requires. Hard-errors with an actionable message if
 * the binary is missing or conversion fails.
 */
export function convertSvgToPdf(
  svgPath: string,
  outPath: string,
  spawn: SpawnFn = spawnSync,
): void {
  const res = spawn("rsvg-convert", ["-f", "pdf", "-o", outPath, svgPath], { encoding: "utf8" });
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(
      `Cannot convert SVG asset '${svgPath}': the 'rsvg-convert' binary was not found. Install librsvg (e.g. 'brew install librsvg') — it is the same tool druckform uses for diagrams.`,
    );
  }
  if (res.status !== 0) {
    throw new Error(`SVG→PDF conversion failed for '${svgPath}': ${res.stderr ?? ""}`);
  }
}

export interface AssetResolverOptions {
  /** Absolute root dir of the template that defines the calling component. */
  templateDir: string;
  /** Scratch dir for converted SVG→PDF output (the render workdir in production). */
  workDir: string;
  /** Shared per-render memo cache: resolved source path → output path. */
  cache: Map<string, string>;
  /** Injectable for tests; defaults to convertSvgToPdf. */
  convertSvg?: (svgPath: string, outPath: string) => void;
}

/**
 * Build a `ctx.asset(ref)` resolver bound to one template directory. Resolves
 * `ref` against `templateDir` (traversal-guarded via resolveAssetPath), returns
 * an absolute path, and auto-converts `.svg` refs to PDF (memoized per render).
 */
export function createAssetResolver(opts: AssetResolverOptions): (ref: string) => string {
  const convert = opts.convertSvg ?? convertSvgToPdf;
  return (ref: string): string => {
    const resolved = resolveAssetPath(opts.templateDir, ref); // absolute; throws on traversal/absolute
    if (!fs.existsSync(resolved)) {
      throw new Error(`Template asset not found: '${ref}' (looked in ${opts.templateDir})`);
    }
    if (!ref.toLowerCase().endsWith(".svg")) {
      return resolved;
    }
    const cached = opts.cache.get(resolved);
    if (cached) return cached;
    // `cache.size` is a monotonic counter for unique output names — the cache is
    // append-only within a render; never delete entries or names would collide.
    const outPath = path.join(opts.workDir, `asset-${opts.cache.size}.pdf`);
    convert(resolved, outPath);
    opts.cache.set(resolved, outPath);
    return outPath;
  };
}
