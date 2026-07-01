import type { BlockElement, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:table", description: "fancy table", acceptsChildren: false };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  return `%FANCYTABLE rows=${element.rows.length}`;
}
