import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { JobStore } from "./job-store.js";
import { makeFinalizeJobTool } from "./tools/finalize-job.js";
import { listComponentsTool } from "./tools/list-components.js";
import { listTemplatesTool } from "./tools/list-templates.js";
import { makeRenderDocumentTool } from "./tools/render-document.js";
import { makeRenderMarkdownTool } from "./tools/render-markdown.js";
import { makeValidateDocumentTool } from "./tools/validate-document.js";

export async function startMcpServer(store: JobStore, baseUrl: string): Promise<void> {
  const server = new McpServer({
    name: "druckform",
    version: "1.0.0",
  });

  // list_templates: no args
  server.tool(listTemplatesTool.name, listTemplatesTool.description, async () =>
    listTemplatesTool.handler(),
  );

  // list_components: { template: string }
  server.tool(
    listComponentsTool.name,
    listComponentsTool.description,
    { template: z.string() },
    async (args) => listComponentsTool.handler(args),
  );

  // validate_document: { job_id: string }
  const validateTool = makeValidateDocumentTool(store);
  server.tool(validateTool.name, validateTool.description, { job_id: z.string() }, async (args) =>
    validateTool.handler(args),
  );

  // render_document: { template: string, style: string }
  const renderTool = makeRenderDocumentTool(store, baseUrl);
  server.tool(
    renderTool.name,
    renderTool.description,
    { template: z.string(), style: z.string() },
    async (args) => renderTool.handler(args),
  );

  // render_markdown: { document: string, template?: string, style?: string }
  const renderMdTool = makeRenderMarkdownTool(store, baseUrl);
  server.tool(
    renderMdTool.name,
    renderMdTool.description,
    { document: z.string(), template: z.string().optional(), style: z.string().optional() },
    async (args) => renderMdTool.handler(args),
  );

  // finalize_job: { job_id: string }
  const finalizeTool = makeFinalizeJobTool(store, baseUrl);
  server.tool(finalizeTool.name, finalizeTool.description, { job_id: z.string() }, async (args) =>
    finalizeTool.handler(args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
