import type { ZodObject, ZodRawShape } from "zod";

// ── Findings & contract shapes ──────────────────────────────────────────────

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
    example?: string;
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

export interface StyleTokens {
  colors: Record<string, string>; // name → #hex
  fonts: { main?: string; mono?: string };
  spacing: Record<string, string>; // name → css-length
}

export interface StyleConfig {
  $schema: string;
  tokens: {
    colors?: Record<string, string>;
    fonts?: { main?: string; mono?: string };
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

export type Component<TSchema extends ZodObject<ZodRawShape>> = (
  // rollup-plugin-dts re-exports z.infer<T> as `infer<T>` (keyword collision) — use _output directly
  params: TSchema["_output"],
  children: string,
  ctx: RenderCtx,
  element?: BlockElement,
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
  render: (params: unknown, children: string, ctx: RenderCtx, element?: BlockElement) => string;
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

export interface TemplateConfig {
  name: string;
  description?: string;
  extends?: string;
  style_defaults?: string;
  components: Record<string, ComponentOverrideSpec>;
}

export interface ResolvedComponentEntry {
  def: ComponentDef;
  defaults: Record<string, string>; // merged param defaults from inheritance chain
}

export interface ResolvedTemplate {
  name: string;
  description?: string;
  origin: "bundled" | "user";
  extendsChain: string[];
  style_defaults?: string;
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
}

// ── LaTeX source map ─────────────────────────────────────────────────────────

export interface SourceMapEntry {
  componentName: string;
  sourceLine: number; // line in source .md
}

export type SourceMap = Map<number, SourceMapEntry>; // .tex line number → source
