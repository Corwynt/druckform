import type {
  ParsedDocument,
  ResolvedTemplate,
  StyleConfig,
  SourceMap,
  ASTNode,
  RenderCtx,
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

  // Preamble structure (joined with \n):
  //   \documentclass{article}         line 1
  //   \usepackage{fontspec}            line 2
  //   \usepackage{xcolor}              line 3
  //   \usepackage{graphicx}            line 4
  //   [stylePreamble — N lines]        lines 5 … 4+N
  //   \begin{document}                 line 5+N
  //   [body]                           starts at line 6+N
  //
  // So body offset = stylePreamble.split("\n").length + 5
  const PREAMBLE_LINES = stylePreamble.split("\n").length + 5;

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
      let latex = mdToLatex(text);
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

  const tex = [
    "\\documentclass{article}",
    "\\usepackage{fontspec}",
    "\\usepackage{xcolor}",
    "\\usepackage{graphicx}",
    stylePreamble,
    "\\begin{document}",
    body,
    "\\end{document}",
  ].join("\n");

  return { tex, sourceMap };
}
