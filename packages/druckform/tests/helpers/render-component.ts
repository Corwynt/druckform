import path from "node:path";
import { loadComponent } from "../../src/component/loader.js";
import type { BlockElement, DocumentLayout, RenderCtx } from "../../src/sdk/types.js";

/** A default RenderCtx for component tests; override any field via `over`. */
export function testCtx(over: Partial<RenderCtx> = {}): RenderCtx {
  const templateDir = "/test/template";
  return {
    token: (n) => `\\druck${n.charAt(0).toUpperCase()}${n.slice(1)}`,
    style: { colors: {}, fonts: {}, spacing: {} },
    frontmatter: {},
    templateDir,
    asset: (ref) => path.resolve(templateDir, ref),
    ...over,
  };
}

/** Load a component from its source path and render it in one call. */
export async function renderComponent(
  sourcePath: string,
  params: Record<string, unknown> = {},
  opts: {
    children?: string;
    element?: BlockElement | DocumentLayout;
    ctx?: Partial<RenderCtx>;
  } = {},
): Promise<string> {
  const def = await loadComponent(sourcePath, "");
  return def.render(params, opts.children ?? "", testCtx(opts.ctx), opts.element);
}
