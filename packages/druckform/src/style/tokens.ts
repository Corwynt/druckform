import type { ResolvedTemplate } from "../sdk/types.js";
import type { StyleConfig } from "../sdk/types.js";
import type { Finding } from "../sdk/types.js";

/**
 * Collects all token names required by the resolved template's components.
 * Token params in declarative components + meta.requiredTokens in TS components.
 */
export function extractRequiredTokens(template: ResolvedTemplate): Set<string> {
  const required = new Set<string>();
  for (const { def } of Object.values(template.components)) {
    for (const token of def.requiredTokens) {
      required.add(token);
    }
  }
  return required;
}

/**
 * Verifies that the style config provides all tokens required by the template.
 * Returns findings (errors) for each missing token.
 */
export function checkTokenCoverage(
  required: Set<string>,
  template: ResolvedTemplate,
  config: StyleConfig,
): Finding[] {
  const available = new Set([
    ...Object.keys(config.tokens.colors ?? {}),
    ...Object.keys(config.tokens.spacing ?? {}),
    ...(config.tokens.fonts?.main ? ["fontMain"] : []),
    ...(config.tokens.fonts?.mono ? ["fontMono"] : []),
  ]);

  const findings: Finding[] = [];
  for (const token of required) {
    if (!available.has(token)) {
      // Find which component needs this token
      const needingComponent = Object.entries(template.components).find(([, entry]) =>
        entry.def.requiredTokens.has(token),
      )?.[0] ?? "unknown";

      findings.push({
        severity: "error",
        component: needingComponent,
        message: `Missing required style token '${token}' (needed by component '${needingComponent}')`,
      });
    }
  }
  return findings;
}
