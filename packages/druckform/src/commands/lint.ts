import fs from "node:fs";
import path from "node:path";
import { validateFrontmatter } from "../parse/frontmatter.js";
import { parseDocument } from "../parse/parser.js";
import type { ASTNode, Finding, LintContract, ResolvedTemplate } from "../sdk/types.js";
import { mergeStyle } from "../style/merge.js";
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

// Recursive AST walker for linting — visits all levels of nesting
function lintNodes(nodes: ASTNode[], resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const node of nodes) {
    if (node.type !== "component") continue;
    // Validate component name
    if (!resolved.components[node.block.name]) {
      findings.push({
        severity: "error",
        component: node.block.name,
        message: `Unknown component '${node.block.name}'`,
        line: node.block.sourceLine,
      });
    } else {
      // Validate required params
      const entry = resolved.components[node.block.name];
      if (entry) {
        try {
          entry.def.schema.parse({ ...entry.defaults, ...node.block.params });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          findings.push({
            severity: "error",
            component: node.block.name,
            message: msg,
            line: node.block.sourceLine,
          });
        }
      }
    }
    // Recurse into children
    lintNodes(node.block.children, resolved, findings);
  }
}

export async function lintCommand(
  templateArg: string | undefined,
  inFile: string,
  stylePath: string | undefined,
  json: boolean,
): Promise<void> {
  const doc = parseDocument(inFile);
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);

  // Template: explicit --template wins; otherwise the document's frontmatter.
  const templateName = templateArg ?? doc.frontmatter.template;
  if (!templateName || !all.has(templateName)) {
    const message = templateName
      ? `Template not found: '${templateName}'`
      : "No template specified — pass --template or set 'template' in the document frontmatter.";
    const contract: LintContract = {
      schemaVersion: "1",
      ok: false,
      findings: [{ severity: "error", component: "template", message }],
    };
    if (json) process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
    else console.error(`[error] template: ${message}`);
    process.exit(1);
  }

  const resolved = await resolveTemplate(templateName, all);
  const findings: Finding[] = [];

  // Validate component names and required params recursively (handles nested blocks)
  lintNodes(doc.nodes, resolved, findings);

  // Validate frontmatter against the template's declared schema
  if (resolved.frontmatter) {
    findings.push(...validateFrontmatter(resolved.frontmatter, doc.frontmatter));
  }

  // Token coverage against the effective style (template style + optional external override)
  if (resolved.style || stylePath) {
    const styleConfig = mergeStyle(resolved.style, stylePath ? loadStyle(stylePath) : undefined);
    const required = extractRequiredTokens(resolved);
    findings.push(...checkTokenCoverage(required, resolved, styleConfig));
  }

  const contract: LintContract = {
    schemaVersion: "1",
    ok: findings.length === 0,
    findings,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else {
    if (contract.ok) {
      console.log("✓ No issues found.");
    } else {
      for (const f of findings) {
        const loc = f.line ? `:${f.line}` : "";
        console.error(`[${f.severity}] ${f.component}${loc}: ${f.message}`);
      }
    }
  }

  if (!contract.ok) process.exit(1);
}
