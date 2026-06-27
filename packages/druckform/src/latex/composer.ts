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
  // So body offset = stylePreamble.split("\n").length + 6
  const PREAMBLE_LINES = stylePreamble.split("\n").length + 6;

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
      let text = node.content;
      // Replace diagram fences with \includegraphics
      for (const [fence, pdfPath] of diagramMap) {
        text = text.replaceAll(fence, `\\includegraphics[width=\\linewidth]{${pdfPath}}`);
      }
      const latex = mdToLatex(text);
      trackLines(latex, "text", node.sourceLine);
      return latex;
    }

    // Component node
    const { block } = node;
    const entry = template.components[block.name];
    if (!entry) {
      throw new Error(`Unknown component '${block.name}' at line ${block.sourceLine}`);
    }

    // Render children first
    const childLatex = renderNodes(block.children);

    // Merge defaults with explicit params
    const mergedParams = { ...entry.defaults, ...block.params };

    // Validate and render
    const latex = entry.def.render(mergedParams, childLatex, ctx);

    trackLines(latex, block.name, block.sourceLine);

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
