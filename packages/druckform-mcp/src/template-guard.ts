// Authoring tools may only address templates by a bare name inside
// DRUCKFORM_TEMPLATES_DIR — never a path. Reject separators and traversal.
export function assertSafeTemplateName(name: string): void {
  if (!name || /[\\/]/u.test(name) || name.includes("..") || name.startsWith(".")) {
    throw new Error(`Invalid template name: '${name}'`);
  }
}

const RESERVED_COMPONENT_PREFIXES = ["block:"];
const RESERVED_COMPONENT_NAMES = ["document"];

// Component names must pass the safe-template-name check and must not be
// reserved built-in names (block:* namespace or 'document').
export function assertSafeComponentName(name: string): void {
  assertSafeTemplateName(name);
  if (
    RESERVED_COMPONENT_NAMES.includes(name) ||
    RESERVED_COMPONENT_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    throw new Error(
      `Reserved component name: '${name}' — 'block:*' and 'document' are built-in and cannot be scaffolded`,
    );
  }
}
