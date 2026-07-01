/** Error for a missing external render tool, pointing at the Docker escape hatch. */
export function missingToolError(tool: string): Error {
  return new Error(
    `'${tool}' not found — install it, or set DRUCK_ENGINE=docker (or pass --engine docker) to render in the bundled container.`,
  );
}
