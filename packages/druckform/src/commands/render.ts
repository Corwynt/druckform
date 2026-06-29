import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prerenderDiagrams } from "../diagram/pre-render.js";
import { composeDocument } from "../latex/composer.js";
import { mapErrors, summarizeFinding } from "../latex/error-mapper.js";
import { runTectonic } from "../latex/tectonic.js";
import { parseDocument } from "../parse/parser.js";
import type { RenderContract } from "../sdk/types.js";
import { checkTokenCoverage, extractRequiredTokens } from "../style/tokens.js";
import { loadStyle } from "../style/validate.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";

// When compiled individually (source/tests): src/commands/ → ../../templates = druckform/templates
// When bundled into dist/cli.js:              dist/        → ../templates   = druckform/templates
const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

export async function renderCommand(
  template: string,
  stylePath: string,
  inFile: string,
  assetsDir: string,
  outPdf: string,
  json: boolean,
): Promise<void> {
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);
  const resolved = await resolveTemplate(template, all);
  const styleConfig = loadStyle(stylePath);

  // Required-token check before invoking LaTeX
  const required = extractRequiredTokens(resolved);
  const tokenFindings = checkTokenCoverage(required, resolved, styleConfig);
  if (tokenFindings.length > 0) {
    const contract: RenderContract = {
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: summarizeFinding(tokenFindings), findings: tokenFindings },
    };
    emitResult(contract, json);
    process.exit(1);
  }

  const doc = parseDocument(inFile);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-"));

  try {
    const diagramMap = await prerenderDiagrams(doc, styleConfig, workDir, path.dirname(stylePath));
    const { tex, sourceMap } = composeDocument(doc, resolved, styleConfig, diagramMap, assetsDir);

    const texPath = path.join(workDir, "document.tex");
    fs.writeFileSync(texPath, tex, "utf8");

    const { ok, log } = runTectonic(texPath, outPdf);

    if (ok) {
      const contract: RenderContract = { schemaVersion: "1", status: "ok", pdf: outPdf };
      emitResult(contract, json);
    } else {
      const findings = mapErrors(log, sourceMap);
      const contract: RenderContract = {
        schemaVersion: "1",
        status: "error",
        pdf: null,
        error: { summary: summarizeFinding(findings), findings },
      };
      emitResult(contract, json);
      process.exit(1);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function emitResult(contract: RenderContract, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else {
    if (contract.status === "ok") {
      console.log(`✓ PDF written to ${contract.pdf}`);
    } else {
      console.error(`✗ ${contract.error?.summary}`);
      for (const f of contract.error?.findings ?? []) {
        const loc = f.line ? `:${f.line}` : "";
        console.error(`  [${f.severity}] ${f.component}${loc}: ${f.message}`);
      }
    }
  }
}
