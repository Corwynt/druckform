import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { missingToolError } from "../engine/tool-error.js";
import { resolveAssetPath } from "../sdk/asset-path.js";
import type { StyleConfig } from "../sdk/types.js";

export function renderMermaid(
  content: string,
  styleConfig: StyleConfig,
  workDir: string,
  index: number,
  styleDir?: string,
): string {
  const inputFile = path.join(workDir, `mermaid-${index}.mmd`);
  const svgFile = path.join(workDir, `mermaid-${index}.svg`);
  const pdfFile = path.join(workDir, `mermaid-${index}.pdf`);
  const configFile = path.join(workDir, `mermaid-${index}.config.json`);

  fs.writeFileSync(inputFile, content, "utf8");

  const mermaidCfg = styleConfig.diagrams?.mermaid;
  const theme = mermaidCfg?.theme ?? "default";

  // Brand colours: inline themeVariables win; otherwise load themeVariablesRef.
  let themeVariables = mermaidCfg?.themeVariables;
  if (!themeVariables && mermaidCfg?.themeVariablesRef) {
    const root = styleDir ?? workDir;
    const refPath = resolveAssetPath(root, mermaidCfg.themeVariablesRef);
    try {
      themeVariables = JSON.parse(fs.readFileSync(refPath, "utf8")) as Record<string, string>;
    } catch (err) {
      throw new Error(
        `Failed to load mermaid themeVariablesRef '${mermaidCfg.themeVariablesRef}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // htmlLabels:false forces SVG <text> labels (librsvg cannot render the HTML in
  // <foreignObject> that Mermaid emits by default, so it would drop every label).
  const config: Record<string, unknown> = { htmlLabels: false, flowchart: { htmlLabels: false } };
  const args = ["-i", inputFile, "-o", svgFile];
  const hasVars = !!themeVariables && Object.keys(themeVariables).length > 0;
  if (hasVars) {
    // themeVariables are only honoured under the "base" theme, and `-t base` is
    // rejected by the mmdc CLI — so set the theme in the config and drop -t.
    config.theme = "base";
    config.themeVariables = themeVariables;
  } else {
    args.push("-t", theme);
  }
  fs.writeFileSync(configFile, JSON.stringify(config), "utf8");
  args.push("-c", configFile);

  const result = spawnSync("mmdc", args, { encoding: "utf8" });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw missingToolError("mmdc");
  }
  if (result.status !== 0) {
    throw new Error(`mermaid rendering failed: ${result.stderr}`);
  }

  // With htmlLabels:false, Mermaid emits each word as its own <tspan> with a
  // leading space; librsvg applies default SVG whitespace handling and strips that
  // leading space, so adjacent words collide ("Neuer Artikel" → "NeuerArtikel").
  // Force xml:space="preserve" on the SVG <text> elements to keep the spaces.
  const svg = fs.readFileSync(svgFile, "utf8").replaceAll("<text ", '<text xml:space="preserve" ');
  fs.writeFileSync(svgFile, svg, "utf8");

  // Convert SVG → PDF using rsvg-convert
  const pdfResult = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfFile, svgFile], {
    encoding: "utf8",
  });
  if (pdfResult.error && (pdfResult.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw missingToolError("rsvg-convert");
  }
  if (pdfResult.status !== 0) {
    throw new Error(`SVG→PDF conversion failed: ${pdfResult.stderr}`);
  }

  return pdfFile;
}
