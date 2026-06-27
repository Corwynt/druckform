import { z } from "zod";
import { generateToken } from "../url-tokens.js";
import type { JobStore } from "../job-store.js";

const schema = z.object({ template: z.string(), style: z.string() });

export function makeRenderDocumentTool(store: JobStore, baseUrl: string) {
  return {
    name: "render_document",
    description:
      "Create a render job and return upload/download URLs. Upload your zip bundle to upload_url, then call finalize_job.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string" },
        style: { type: "string", description: "Style name or path within the zip bundle" },
      },
      required: ["template", "style"],
    },
    handler: async (args: unknown) => {
      const { template, style } = schema.parse(args);

      // Create job first to get actual UUID
      const job = store.create(template, style, "placeholder-upload", "placeholder-download");
      // Generate tokens with real job UUID
      const uploadToken = generateToken(job.id, "upload");
      const downloadToken = generateToken(job.id, "download");
      // Update job with real tokens
      store.update(job.id, { uploadToken, downloadToken });

      const result = {
        job_id: job.id,
        upload_url: `${baseUrl}/upload/${uploadToken}`,
        download_url: `${baseUrl}/download/${downloadToken}`,
        expires_at: new Date(job.expiresAt).toISOString(),
        manifest_spec: {
          document: "document.md (required, at zip root)",
          assets: "assets/** (optional, referenced by path relative to root)",
          maxBytes: 52428800,
        },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  };
}
