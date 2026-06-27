import path from "node:path";

/**
 * Resolves `assetRef` against `assetsRoot` and throws if the resolved path
 * would escape the root (path traversal / absolute path injection).
 *
 * Returns the absolute resolved path when safe.
 */
export function resolveAssetPath(assetsRoot: string, assetRef: string): string {
  if (path.isAbsolute(assetRef)) {
    throw new Error(`Asset ref must be relative, got: ${assetRef}`);
  }
  const resolved = path.resolve(assetsRoot, assetRef);
  const root = path.resolve(assetsRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Asset ref escapes assets root: ${assetRef}`);
  }
  return resolved;
}
