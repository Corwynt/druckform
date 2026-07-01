import type { ZodObject, ZodRawShape } from "zod";

// ── Findings & contract shapes ──────────────────────────────────────────────

/** Bump when the component authoring contract changes shape. */
export const COMPONENT_CONTRACT_VERSION = "1";

export interface Finding {
  severity: "error" | "warning";
  component: string;
  message: string;
  line?: number;
}

export interface TemplatesContract {
  schemaVersion: "1";
  templates: Array<{
    name: string;
    extends: string | null;
    origin: "bundled" | "user";
    description?: string;
  }>;
}

export interface ComponentsContract {
  schemaVersion: "1";
  template: string;
  components: Array<{
    name: string;
    description: string;
    params: Record<string, unknown>; // JSON Schema
    acceptsChildren: boolean;
    acceptsElement: boolean; // reads the BlockElement/DocumentLayout payload
    contractVersion: string;
    example?: string;
    source?: string; // raw component source text
  }>;
}

export interface LintContract {
  schemaVersion: "1";
  ok: boolean;
  findings: Finding[];
}

export interface RenderContract {
  schemaVersion: "1";
  status: "ok" | "error";
  pdf: string | null;
  error?: { summary: string; findings: Finding[] };
}

// ── Style ───────────────────────────────────────────────────────────────────

export type FontSpec = string | { name: string; options?: string };

export interface StyleTokens {
  colors: Record<string, string>; // name → #hex
  fonts: { main?: FontSpec; mono?: FontSpec };
  spacing: Record<string, string>; // name → css-length
}

export interface StyleConfig {
  $schema: string;
  tokens: {
    colors?: Record<string, string>;
    fonts?: { main?: FontSpec; mono?: FontSpec };
    spacing?: Record<string, string>;
  };
  diagrams?: {
    mermaid?: { theme?: string; themeVariablesRef?: string };
    plantuml?: { skinRef?: string };
  };
}

// ── Render context ──────────────────────────────────────────────────────────

export interface RenderCtx {
  /** Returns the LaTeX macro name for a style token, e.g. \accentcolor */
  token(name: string): string;
  style: StyleTokens;
  /** Document frontmatter values (with template-schema defaults applied), e.g. title/author. */
  frontmatter: Record<string, string>;
  /** Absolute root dir of the template that defines the calling component. */
  templateDir: string;
  /**
   * Resolve a template-bundled asset to an absolute path. SVG refs are converted
   * to PDF. Use the returned path directly in \includegraphics — it reaches
   * tectonic's temp workdir without copying.
   */
  asset(ref: string): string;
}

// ── Components ──────────────────────────────────────────────────────────────

// Typed payload for built-in block-level element components. Supplied by the
// Markdown emitter; user components leave the 4th render arg undefined.
export type BlockElement =
  | {
      kind: "table";
      alignments: Array<"left" | "center" | "right" | null>;
      header: string[]; // each cell is pre-rendered inline LaTeX
      rows: string[][]; // each cell is pre-rendered inline LaTeX
    }
  | { kind: "codeblock"; language: string | null; code: string }
  | {
      kind: "list";
      ordered: boolean;
      start: number | null;
      items: Array<{ content: string; task: "checked" | "unchecked" | null }>;
    }
  | { kind: "heading"; level: number } // content via `children`
  | { kind: "blockquote" } // content via `children`
  | { kind: "image"; src: string; alt: string; title: string | null } // src = resolved path
  | { kind: "hr" };

// Typed payload for the built-in `document` shell component. Supplied by the
// composer; the document component owns everything after the engine-core
// packages and chooses the documentclass value.
export interface DocumentLayout {
  kind: "document";
  documentclass: string; // class name the composer emits (default "article")
  stylePreamble: string; // compiled style (raw LaTeX)
  componentPreamble: string; // deduped component preambles (raw LaTeX); excludes `document`
  frontmatter: Record<string, string>; // {} in Phase 2; populated in Phase 3
}

export type Component<TSchema extends ZodObject<ZodRawShape>> = (
  // rollup-plugin-dts re-exports z.infer<T> as `infer<T>` (keyword collision) — use _output directly
  params: TSchema["_output"],
  children: string,
  ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
) => string;

export interface ComponentMeta {
  name: string;
  description: string;
  acceptsChildren: boolean;
  example?: string;
  /** Token names this component reads from ctx.token() — for static validation */
  requiredTokens?: string[];
}

export interface ComponentDef {
  meta: ComponentMeta;
  schema: ZodObject<ZodRawShape>;
  /** JSON Schema derived from zod schema, for contract output */
  jsonSchema: Record<string, unknown>;
  render: (
    params: unknown,
    children: string,
    ctx: RenderCtx,
    element?: BlockElement | DocumentLayout,
  ) => string;
  /** All token names this component requires (from params + meta.requiredTokens) */
  requiredTokens: Set<string>;
  /** LaTeX preamble block this component needs injected once before \begin{document} */
  preamble?: string;
}

// ── Templates ───────────────────────────────────────────────────────────────

export interface ComponentOverrideSpec {
  source?: string; // path to .ts or .component.yaml (relative to template dir)
  extends?: string; // "parentTemplate.componentName" — type-a partial override only
  defaults?: Record<string, string>;
}

/** Per-field frontmatter declaration (validated like component params). */
export type FrontmatterSpec = Record<
  string,
  { type?: "string"; required?: boolean; default?: string }
>;

export interface TemplateConfig {
  name: string;
  description?: string;
  extends?: string;
  /** Inline default style; merged down the extends chain and under any external override. */
  style?: StyleConfig;
  /** Frontmatter fields this template accepts; merged down the extends chain. */
  frontmatter?: FrontmatterSpec;
  components: Record<string, ComponentOverrideSpec | null>;
}

export interface ResolvedComponentEntry {
  def: ComponentDef;
  defaults: Record<string, string>; // merged param defaults from inheritance chain
  sourcePath: string; // absolute path to the component's source file
  templateDir: string; // absolute root dir of the template that defines this component
}

export interface ResolvedTemplate {
  name: string;
  description?: string;
  origin: "bundled" | "user";
  extendsChain: string[];
  /** Style merged down the extends chain (root → leaf). */
  style?: StyleConfig;
  /** Frontmatter schema merged down the extends chain (root → leaf). */
  frontmatter?: FrontmatterSpec;
  components: Record<string, ResolvedComponentEntry>;
}

// ── AST ─────────────────────────────────────────────────────────────────────

export interface ComponentBlock {
  name: string;
  params: Record<string, string>;
  children: ASTNode[];
  sourceLine: number;
}

export type ASTNode =
  | { type: "text"; content: string; sourceLine: number }
  | { type: "component"; block: ComponentBlock };

export interface ParsedDocument {
  nodes: ASTNode[];
  frontmatter: Record<string, string>;
}

// ── LaTeX source map ─────────────────────────────────────────────────────────

export interface SourceMapEntry {
  componentName: string;
  sourceLine: number; // line in source .md
}

export type SourceMap = Map<number, SourceMapEntry>; // .tex line number → source
