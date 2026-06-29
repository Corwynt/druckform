import fs from "node:fs";
import path from "node:path";
import type { Finding, LintContract, ResolvedTemplate } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";

const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

function checkMeta(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    if (!entry.def.meta?.name) {
      findings.push({
        severity: "error",
        component: name,
        message: "Component meta.name is missing",
      });
    }
    if (typeof entry.def.meta?.acceptsChildren !== "boolean") {
      findings.push({
        severity: "warning",
        component: name,
        message: "meta.acceptsChildren should be a boolean",
      });
    }
  }
}

export async function doctorCommand(template: string, json: boolean): Promise<void> {
  const all = (() => {
    try {
      return loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  })();

  const findings: Finding[] = [];
  let resolved: ResolvedTemplate | null = null;

  if (all instanceof Error) {
    findings.push({ severity: "error", component: "template", message: all.message });
  } else {
    try {
      resolved = await resolveTemplate(template, all);
    } catch (err) {
      findings.push({
        severity: "error",
        component: "template",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (resolved) {
    checkMeta(resolved, findings);
    // further checks added in later tasks
  }

  const contract: LintContract = { schemaVersion: "1", ok: findings.length === 0, findings };
  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else if (contract.ok) {
    console.log(`✓ Template '${template}' looks healthy.`);
  } else {
    for (const f of findings) console.error(`[${f.severity}] ${f.component}: ${f.message}`);
  }
  if (!contract.ok) process.exit(1);
}
