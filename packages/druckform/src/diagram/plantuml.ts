import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { StyleConfig } from "../sdk/types.js";
import { resolveAssetPath } from "../sdk/asset-path.js";

const PLANTUML_JAR = process.env["PLANTUML_JAR"] ?? "/usr/local/lib/plantuml.jar";

export function renderPlantUML(
  content: string,
  styleConfig: StyleConfig,
  workDir: string,
  index: number,
): string {
  const inputFile = path.join(workDir, `plantuml-${index}.puml`);
  const svgFile = path.join(workDir, `plantuml-${index}.svg`);
  const pdfFile = path.join(workDir, `plantuml-${index}.pdf`);

  // Prepend skin if configured
  let fullContent = content;
  const skinRef = styleConfig.diagrams?.plantuml?.skinRef;
  if (skinRef) {
    // Validate the path doesn't escape the assets root (workDir as root)
    const safeSkinPath = resolveAssetPath(workDir, skinRef);
    fullContent = `!include ${safeSkinPath}\n${content}`;
  }
  fs.writeFileSync(inputFile, fullContent, "utf8");

  const result = spawnSync(
    "java",
    ["-jar", PLANTUML_JAR, "-tsvg", "-o", workDir, inputFile],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`PlantUML rendering failed: ${result.stderr}`);
  }

  // Convert SVG → PDF
  const pdfResult = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfFile, svgFile], {
    encoding: "utf8",
  });
  if (pdfResult.status !== 0) {
    throw new Error(`SVG→PDF conversion failed: ${pdfResult.stderr}`);
  }

  return pdfFile;
}
