import type { ParsedDocument, StyleConfig } from "../sdk/types.js";
import { parseMaxHeightFraction } from "./fence-info.js";
import { renderMermaid } from "./mermaid.js";
import { renderPlantUML } from "./plantuml.js";

const MERMAID_FENCE = /^```mermaid( [^\n]*)?\n([\s\S]*?)```$/m;
const PLANTUML_FENCE = /^```plantuml( [^\n]*)?\n([\s\S]*?)```$/m;

/**
 * Finds fenced diagram blocks in text nodes, renders them to PDF files,
 * and returns a map of original fence text → { pdf path, optional per-diagram
 * max height } derived from a `maxheight=<n>` directive in the fence info-string.
 */
export async function prerenderDiagrams(
  doc: ParsedDocument,
  styleConfig: StyleConfig,
  workDir: string,
  styleDir?: string,
): Promise<Map<string, { pdfPath: string; maxHeight?: string }>> {
  const results = new Map<string, { pdfPath: string; maxHeight?: string }>();
  let mermaidIdx = 0;
  let plantumlIdx = 0;

  function processText(text: string) {
    for (const match of text.matchAll(new RegExp(MERMAID_FENCE.source, "gm"))) {
      const fence = match[0] ?? "";
      const maxHeight = parseMaxHeightFraction(match[1]);
      const content = match[2] ?? "";
      if (!results.has(fence)) {
        const pdfPath = renderMermaid(content, styleConfig, workDir, mermaidIdx++, styleDir);
        results.set(fence, { pdfPath, ...(maxHeight ? { maxHeight } : {}) });
      }
    }
    for (const match of text.matchAll(new RegExp(PLANTUML_FENCE.source, "gm"))) {
      const fence = match[0] ?? "";
      const maxHeight = parseMaxHeightFraction(match[1]);
      const content = match[2] ?? "";
      if (!results.has(fence)) {
        const pdfPath = renderPlantUML(content, styleConfig, workDir, plantumlIdx++, styleDir);
        results.set(fence, { pdfPath, ...(maxHeight ? { maxHeight } : {}) });
      }
    }
  }

  function walkNodes(nodes: typeof doc.nodes) {
    for (const node of nodes) {
      if (node.type === "text") processText(node.content);
      else walkNodes(node.block.children);
    }
  }

  walkNodes(doc.nodes);
  return results;
}
