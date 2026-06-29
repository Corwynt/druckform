import type { Finding, FrontmatterSpec } from "../sdk/types.js";

/** Returns an error finding for each required frontmatter key that is missing. */
export function validateFrontmatter(
  spec: FrontmatterSpec,
  values: Record<string, string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const [key, field] of Object.entries(spec)) {
    if (field.required && values[key] === undefined) {
      findings.push({
        severity: "error",
        component: "frontmatter",
        message: `Missing required frontmatter '${key}'`,
      });
    }
  }
  return findings;
}

/** Merges schema defaults under the provided values (values win). */
export function applyFrontmatterDefaults(
  spec: FrontmatterSpec | undefined,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(spec ?? {})) {
    if (field.default !== undefined) out[key] = field.default;
  }
  return { ...out, ...values };
}
