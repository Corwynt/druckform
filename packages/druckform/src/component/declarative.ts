import fs from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { escapeTeX } from "../sdk/tex.js";
import type { ComponentDef, RenderCtx } from "../sdk/types.js";

interface ParamSpec {
  type: "string" | "token";
  required?: boolean;
  default?: string;
}

interface DeclarativeComponentYaml {
  name: string;
  description: string;
  params: Record<string, ParamSpec>;
  slots?: { children?: boolean };
  emits: string;
  preamble?: string;
  example?: string;
}

export function loadDeclarativeComponent(yamlPath: string): ComponentDef {
  const raw_yaml = fs.readFileSync(yamlPath, "utf8");
  const spec = yaml.load(raw_yaml) as DeclarativeComponentYaml;

  // Build Zod schema from param specs
  const shape: Record<string, z.ZodTypeAny> = {};
  const requiredTokens = new Set<string>();

  for (const [name, param] of Object.entries(spec.params)) {
    if (param.type === "token") {
      // Token params: default is the token name
      const defaultToken = param.default ?? name;
      requiredTokens.add(defaultToken);
      const field = z.string().default(defaultToken);
      shape[name] = field;
    } else {
      // String params
      let field: z.ZodTypeAny = z.string();
      if (!param.required) {
        field = param.default !== undefined ? field.default(param.default) : field.optional();
      }
      shape[name] = field;
    }
  }

  const schema = z.object(shape);
  const jsonSchema =
    zodToJsonSchema(schema, { name: spec.name }).definitions?.[spec.name] ??
    zodToJsonSchema(schema);
  const acceptsChildren = spec.slots?.children === true;

  // Compile the emits template into a render function
  // Slots: {{paramName}} for escaped text, {{children}} for raw LaTeX
  const render = (
    params: unknown,
    children: string,
    ctx: RenderCtx,
    element?: import("../sdk/types.js").BlockElement | import("../sdk/types.js").DocumentLayout,
  ): string => {
    const validated = schema.parse(params);
    let output = spec.emits;

    // Replace token slots with resolved macros
    for (const [name, param] of Object.entries(spec.params)) {
      if (param.type === "token") {
        const tokenName = (validated as Record<string, string>)[name] ?? param.default ?? name;
        output = output.replaceAll(`{{${name}}}`, ctx.token(tokenName));
      } else {
        const value = (validated as Record<string, string | undefined>)[name];
        if (value !== undefined) {
          output = output.replaceAll(`{{${name}}}`, escapeTeX(value));
        }
      }
    }

    // Replace children slot
    if (acceptsChildren) {
      output = output.replaceAll("{{children}}", children);
    }

    // Document shell slots (raw LaTeX) — only when rendering the `document` shell.
    if (element && element.kind === "document") {
      output = output
        .replaceAll("{{stylePreamble}}", element.stylePreamble)
        .replaceAll("{{componentPreamble}}", element.componentPreamble)
        .replaceAll("{{documentclass}}", element.documentclass)
        .replaceAll("{{body}}", "DRUCKFORM_BODY");
    }

    return output;
  };

  return {
    meta: {
      name: spec.name,
      description: spec.description,
      acceptsChildren,
      ...(spec.example !== undefined ? { example: spec.example } : {}),
      requiredTokens: [...requiredTokens],
    },
    schema,
    jsonSchema: jsonSchema as Record<string, unknown>,
    render,
    requiredTokens,
    ...(spec.preamble !== undefined ? { preamble: spec.preamble } : {}),
  };
}
