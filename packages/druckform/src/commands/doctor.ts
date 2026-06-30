import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type {
  DocumentLayout,
  Finding,
  LintContract,
  RenderCtx,
  ResolvedTemplate,
} from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";

interface DeclYaml {
  name: string;
  params?: Record<string, { type?: string }>;
  slots?: { children?: boolean };
  emits?: string;
}

const DOCUMENT_SLOTS = new Set(["stylePreamble", "componentPreamble", "documentclass", "body"]);

function checkDeclarativeSlots(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    const ext = entry.sourcePath.toLowerCase();
    if (!ext.endsWith(".yaml") && !ext.endsWith(".yml")) continue;
    const spec = yaml.load(fs.readFileSync(entry.sourcePath, "utf8")) as DeclYaml;
    const emits = spec.emits ?? "";
    const params = new Set(Object.keys(spec.params ?? {}));
    const acceptsChildren = spec.slots?.children === true;
    for (const m of emits.matchAll(/\{\{([^{}]+)\}\}/g)) {
      const slot = (m[1] ?? "").trim();
      const ok =
        params.has(slot) ||
        (slot === "children" && acceptsChildren) ||
        slot.startsWith("fm.") ||
        (name === "document" && DOCUMENT_SLOTS.has(slot));
      if (!ok) {
        findings.push({
          severity: "error",
          component: name,
          message: `emits references unknown slot '{{${slot}}}' (no matching param/children/fm.*/document slot)`,
        });
      }
    }
  }
}

function checkTsSource(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    if (!/\.(ts|js|mjs)$/i.test(entry.sourcePath)) continue;
    const src = fs.readFileSync(entry.sourcePath, "utf8");
    const used = new Set<string>();
    for (const m of src.matchAll(/(?:ctx\.token|tokenRef)\(\s*["']([^"']+)["']\s*\)/g)) {
      if (m[1]) used.add(m[1]);
    }
    for (const token of used) {
      if (!entry.def.requiredTokens.has(token)) {
        findings.push({
          severity: "warning",
          component: name,
          message: `uses token '${token}' but does not declare it (add tokenRef("${token}") or meta.requiredTokens)`,
        });
      }
    }
    // Heuristic: interpolating a param without escaping (only a hint; low confidence).
    if (/\$\{\s*params\.\w+\s*\}/.test(src) && !/escapeTeX|Tex`/.test(src)) {
      findings.push({
        severity: "warning",
        component: name,
        message: "interpolates params.* without escapeTeX/Tex — verify user input is escaped",
      });
    }
  }
}

function checkDocumentShell(resolved: ResolvedTemplate, findings: Finding[]): void {
  const entry = resolved.components.document;
  if (!entry) return;
  const ctx: RenderCtx = {
    token: (n) => `\\druck${n.charAt(0).toUpperCase()}${n.slice(1)}`,
    style: { colors: {}, fonts: {}, spacing: {} },
    frontmatter: {},
    templateDir: entry.templateDir,
    asset: (ref) => path.join(entry.templateDir, ref),
  };
  const layout: DocumentLayout = {
    kind: "document",
    documentclass: "article",
    stylePreamble: "%STYLE",
    componentPreamble: "%COMPONENTS",
    frontmatter: {},
  };
  let out: string;
  try {
    out = entry.def.render({}, "", ctx, layout);
  } catch (err) {
    findings.push({
      severity: "error",
      component: "document",
      message: `document shell threw during probe: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  if (!out.includes("DRUCKFORM_BODY")) {
    findings.push({
      severity: "error",
      component: "document",
      message:
        "document shell must emit the body marker DRUCKFORM_BODY (declarative: {{body}}); the composer substitutes the rendered body there",
    });
  }
}

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
    checkDeclarativeSlots(resolved, findings);
    checkTsSource(resolved, findings);
    checkDocumentShell(resolved, findings);
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
