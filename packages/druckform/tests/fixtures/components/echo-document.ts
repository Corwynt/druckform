import type { BlockElement, DocumentLayout, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "echo-doc", description: "test", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "NO-DOC";
  return `KIND:${element.kind} STYLE:${element.stylePreamble}`;
}
