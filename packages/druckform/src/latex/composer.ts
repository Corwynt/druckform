import os from "node:os";
import { applyFrontmatterDefaults } from "../parse/frontmatter.js";
import { createAssetResolver } from "../sdk/asset-resolver.js";
import type {
  ASTNode,
  DocumentLayout,
  ParsedDocument,
  RenderCtx,
  ResolvedComponentEntry,
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

// Engine-core packages — always injected by the composer, never overrideable.
// They are correctness requirements of the rendered output, not layout choices:
//   fontspec (style fonts) · xcolor (style colors) · graphicx (images) ·
//   hyperref (links) · ulem (strikethrough).
const ENGINE_CORE = [
  "\\usepackage{fontspec}",
  "\\usepackage{xcolor}",
  "\\usepackage{graphicx}",
  "\\usepackage{hyperref}",
  "\\usepackage[normalem]{ulem}",
].join("\n");

// Sentinel the `document` shell component emits where the body belongs. The
// composer renders the shell first (independent of the body), locates this
// marker to derive the source-map offset, then substitutes the rendered body.
const BODY_MARKER = "DRUCKFORM_BODY";

export function composeDocument(
  doc: ParsedDocument,
  template: ResolvedTemplate,
  styleConfig: StyleConfig,
  diagramMap: Map<string, string>, // fence text → pdf path
  assetsRoot: string,
  workDir: string = os.tmpdir(),
): ComposeResult {
  const sourceMap: SourceMap = new Map();

  const frontmatter = applyFrontmatterDefaults(template.frontmatter, doc.frontmatter ?? {});

  const baseCtx = {
    token: (name: string) => tokenMacro(name),
    style: {
      colors: styleConfig.tokens.colors ?? {},
      fonts: styleConfig.tokens.fonts ?? {},
      spacing: styleConfig.tokens.spacing ?? {},
    },
    frontmatter,
  };

  // Converted-SVG memo cache, shared across every component in this render.
  const svgCache = new Map<string, string>();
  function ctxFor(entry: ResolvedComponentEntry): RenderCtx {
    return {
      ...baseCtx,
      templateDir: entry.templateDir,
      asset: createAssetResolver({ templateDir: entry.templateDir, workDir, cache: svgCache }),
    };
  }

  const stylePreamble = compileStyle(styleConfig);

  // Collect preamble blocks from all template components (deduplicated),
  // EXCLUDING the `document` shell — it is the preamble owner, not a contributor.
  const preambleBlocks = new Set<string>();
  for (const [name, entry] of Object.entries(template.components)) {
    if (name === "document") continue;
    if (entry.def.preamble) preambleBlocks.add(entry.def.preamble.trim());
  }
  const componentPreamble = [...preambleBlocks].join("\n");

  // Render the document shell through the (overrideable) `document` component.
  const docEntry = template.components.document;
  if (!docEntry) {
    throw new Error(
      `Template '${template.name}' is missing the built-in 'document' shell component. Templates must extend 'base'.`,
    );
  }
  const documentclass = "article"; // Phase 3: overridable via params/frontmatter
  const layout: DocumentLayout = {
    kind: "document",
    documentclass,
    stylePreamble,
    componentPreamble,
    frontmatter,
  };
  const shellCtx = ctxFor(docEntry);
  const shell = docEntry.def.render({}, "", shellCtx, layout);

  // Composer-owned head (documentclass + engine core) precedes the shell output.
  const head = `\\documentclass{${documentclass}}\n${ENGINE_CORE}`;
  const full = `${head}\n${shell}`;
  const markerIdx = full.indexOf(BODY_MARKER);
  if (markerIdx < 0) {
    throw new Error(
      `The 'document' component must include the body marker (${BODY_MARKER}). ` +
        `Declarative shells use {{body}}; TS shells emit "${BODY_MARKER}".`,
    );
  }
  // Number of complete lines preceding the body line, used to align the source map.
  const PREAMBLE_LINES = full.slice(0, markerIdx).split("\n").length - 1;

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
      let latex = mdToLatex(text, { template, ctx: shellCtx, assetsRoot });
      // Replace placeholders with actual LaTeX after escaping
      for (const [placeholder, latexCmd] of placeholders) {
        latex = latex.replaceAll(placeholder, latexCmd);
      }
      trackLines(latex, "text", node.sourceLine);
      return latex;
    }

    // Component node
    const { block } = node;
    if (block.name === "document" || block.name.startsWith("block:")) {
      throw new Error(
        `Component '${block.name}' is renderer-internal and cannot be used as a ::: block ` +
          `(line ${block.sourceLine})`,
      );
    }
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
    const latex = entry.def.render(mergedParams, childLatex, ctxFor(entry));

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
  const tex = full.replace(BODY_MARKER, body);

  return { tex, sourceMap };
}
