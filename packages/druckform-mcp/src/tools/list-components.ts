import { z } from "zod";
import { listComponents } from "../cli-runner.js";

const schema = z.object({ template: z.string() });

export const listComponentsTool = {
  name: "list_components",
  description: "List the resolved components for a template.",
  inputSchema: {
    type: "object",
    properties: { template: { type: "string", description: "Template name" } },
    required: ["template"],
  },
  handler: async (args: unknown) => {
    const { template } = schema.parse(args);
    const result = listComponents(template);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};
