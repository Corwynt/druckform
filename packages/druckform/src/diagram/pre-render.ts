import type { ParsedDocument, StyleConfig } from "../sdk/types.js";
import { renderMermaid } from "./mermaid.js";
import { renderPlantUML } from "./plantuml.js";

const MERMAID_FENCE = /^```mermaid\n([\s\S]*?)```$/m;
const PLANTUML_FENCE = /^```plantuml\n([\s\S]*?)```$/m;

/**
 * Finds fenced diagram blocks in text nodes, renders them to PDF files,
 * and returns a map of original fence text → absolute PDF path.
 */
export async function prerenderDiagrams(
  doc: ParsedDocument,
  styleConfig: StyleConfig,
  workDir: string,
  styleDir?: string,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  let mermaidIdx = 0;
  let plantumlIdx = 0;

  function processText(text: string) {
    for (const match of text.matchAll(new RegExp(MERMAID_FENCE.source, "gm"))) {
      const fence = match[0] ?? "";
      const content = match[1] ?? "";
      if (!results.has(fence)) {
        results.set(fence, renderMermaid(content, styleConfig, workDir, mermaidIdx++, styleDir));
      }
    }
    for (const match of text.matchAll(new RegExp(PLANTUML_FENCE.source, "gm"))) {
      const fence = match[0] ?? "";
      const content = match[1] ?? "";
      if (!results.has(fence)) {
        results.set(fence, renderPlantUML(content, styleConfig, workDir, plantumlIdx++, styleDir));
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
