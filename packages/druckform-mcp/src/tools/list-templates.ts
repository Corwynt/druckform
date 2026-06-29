import { listTemplates } from "../cli-runner.js";

export const listTemplatesTool = {
  name: "list_templates",
  description: "List all available document templates.",
  inputSchema: { type: "object", properties: {}, required: [] },
  handler: async () => {
    const result = listTemplates();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};
