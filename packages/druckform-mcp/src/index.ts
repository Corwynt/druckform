import { JobStore } from "./job-store.js";
import { startHttpServer } from "./http-server.js";
import { startMcpServer } from "./mcp-server.js";

const HTTP_PORT = parseInt(process.env["DRUCKFORM_HTTP_PORT"] ?? "7331", 10);

const store = new JobStore();

process.on("SIGTERM", () => { store.destroy(); process.exit(0); });
process.on("SIGINT",  () => { store.destroy(); process.exit(0); });

const baseUrl = await startHttpServer(store, HTTP_PORT);
console.error(`[druckform-mcp] HTTP server listening on ${baseUrl}`);
console.error("[druckform-mcp] Starting MCP server on stdio...");

await startMcpServer(store, baseUrl);
