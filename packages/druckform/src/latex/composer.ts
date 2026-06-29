import type {
  ASTNode,
  ParsedDocument,
  RenderCtx,
  ResolvedTemplate,
  SourceMap,
  StyleConfig,
} from "../sdk/types.js";
import { compileStyle, tokenMacro } from "../style/compiler.js";
import { mdToLatex } from "./md-to-latex.js";

interface ComposeResult {
  tex: string;
  sourceMap: SourceMap;
}

export function composeDocument(
  doc: ParsedDocument,
  template: ResolvedTemplate,
  styleConfig: StyleConfig,
  diagramMap: Map<string, string>, // fence text → pdf path
  assetsRoot: string,
): ComposeResult {
  const sourceMap: SourceMap = new Map();

  const ctx: RenderCtx = {
    token: (name) => tokenMacro(name),
    style: {
      colors: styleConfig.tokens.colors ?? {},
      fonts: styleConfig.tokens.fonts ?? {},
      spacing: styleConfig.tokens.spacing ?? {},
    },
  };

  const stylePreamble = compileStyle(styleConfig);

  // Collect preamble blocks from all template components (deduplicated).
  // Collected upfront so PREAMBLE_LINES is known before body rendering.
  const preambleBlocks = new Set<string>();
  for (const entry of Object.values(template.components)) {
    if (entry.def.preamble) preambleBlocks.add(entry.def.preamble.trim());
  }
  const componentPreamble = [...preambleBlocks].join("\n");

  // Preamble structure (joined with \n):
  //   \documentclass{article}         line 1
  //   \usepackage{fontspec}            line 2
  //   \usepackage{xcolor}              line 3
  //   \usepackage{graphicx}            line 4
  //   \usepackage{hyperref}            line 5
  //   \usepackage[normalem]{ulem}      line 6
  //   [stylePreamble — S lines]        lines 7 … 6+S
  //   [componentPreamble — C lines]    lines 7+S … 6+S+C  (omitted when empty)
  //   \begin{document}                 line 7+S+C
  //   [body]                           starts at line 8+S+C
  const componentPreambleLines = componentPreamble ? componentPreamble.split("\n").length : 0;
  const PREAMBLE_LINES = stylePreamble.split("\n").length + 7 + componentPreambleLines;

  let lineCounter = 0;

  function trackLines(content: string, componentName: string, sourceLine: number): void {
    const newLines = content.split("\n");
    for (let i = 0; i < newLines.length; i++) {
      lineCounter++;
      sourceMap.set(lineCounter + PREAMBLE_LINES, { componentName, sourceLine });
    }
  }

  function renderNodes(nodes: ASTNode[]): string {
    return nodes.map(renderNode).join("\n");
  }

  function renderNode(node: ASTNode): string {
    if (node.type === "text") {
      // Replace diagram fences with unique placeholders before mdToLatex,
      // so that mdToLatex cannot escape backslashes/braces in the LaTeX commands.
      let text = node.content;
      const placeholders = new Map<string, string>();
      let idx = 0;
      for (const [fence, pdfPath] of diagramMap) {
        const placeholder = `DRUCKFORM_DIAGRAM_${idx++}`;
        placeholders.set(placeholder, `\\includegraphics[width=\\linewidth]{${pdfPath}}`);
        text = text.replaceAll(fence, placeholder);
      }
      // mdToLatex escapes user text; placeholders are all-caps alphanumeric, won't be altered
      let latex = mdToLatex(text, { template, ctx, assetsRoot });
      // Replace placeholders with actual LaTeX after escaping
      for (const [placeholder, latexCmd] of placeholders) {
        latex = latex.replaceAll(placeholder, latexCmd);
      }
      trackLines(latex, "text", node.sourceLine);
      return latex;
    }

    // Component node
    const { block } = node;
    const entry = template.components[block.name];
    if (!entry) {
      throw new Error(`Unknown component '${block.name}' at line ${block.sourceLine}`);
    }

    // Render children first (children track their own lines)
    const preChildCounter = lineCounter;
    const childLatex = renderNodes(block.children);
    const childLineCount = lineCounter - preChildCounter;

    // Merge defaults with explicit params
    const mergedParams = { ...entry.defaults, ...block.params };

    // Validate and render
    const latex = entry.def.render(mergedParams, childLatex, ctx);

    // Track only the lines added by this component's own template wrapper
    // (total lines minus the embedded child lines to avoid double-counting)
    const totalLatexLines = latex.split("\n").length;
    const componentOwnLines = Math.max(0, totalLatexLines - childLineCount);
    for (let i = 0; i < componentOwnLines; i++) {
      lineCounter++;
      sourceMap.set(lineCounter + PREAMBLE_LINES, {
        componentName: block.name,
        sourceLine: block.sourceLine,
      });
    }

    return latex;
  }

  const body = renderNodes(doc.nodes);

  const texParts = [
    "\\documentclass{article}",
    "\\usepackage{fontspec}",
    "\\usepackage{xcolor}",
    "\\usepackage{graphicx}",
    "\\usepackage{hyperref}",
    "\\usepackage[normalem]{ulem}",
    stylePreamble,
  ];
  if (componentPreamble) texParts.push(componentPreamble);
  texParts.push("\\begin{document}", body, "\\end{document}");
  const tex = texParts.join("\n");

  return { tex, sourceMap };
}
