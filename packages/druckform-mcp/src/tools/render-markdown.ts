import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { renderDocument } from "../cli-runner.js";
import type { JobStore } from "../job-store.js";
import { generateToken } from "../url-tokens.js";

const schema = z.object({
  document: z.string(),
  template: z.string().optional(),
  style: z.string().optional(),
});

export function makeRenderMarkdownTool(store: JobStore, baseUrl: string) {
  return {
    name: "render_markdown",
    description:
      "Render an asset-less Markdown document to PDF inline (no ZIP, no upload). Pass the document text directly; template/style are optional (template may come from frontmatter, style from the template). Returns a download_url.",
    inputSchema: {
      type: "object",
      properties: {
        document: {
          type: "string",
          description: "Markdown document text (may include frontmatter)",
        },
        template: {
          type: "string",
          description: "Template name (optional; overrides frontmatter)",
        },
        style: { type: "string", description: "Style YAML text (optional override)" },
      },
      required: ["document"],
    },
    handler: async (args: unknown) => {
      const { document, template, style } = schema.parse(args);

      const job = store.createInline(template, "placeholder-download");
      const downloadToken = generateToken(job.id, "download");
      store.update(job.id, { downloadToken });

      const inFile = path.join(job.dir, "document.md");
      fs.writeFileSync(inFile, document, "utf8");
      let stylePath: string | undefined;
      if (style !== undefined) {
        stylePath = path.join(job.dir, "style.yaml");
        fs.writeFileSync(stylePath, style, "utf8");
      }

      store.update(job.id, { status: "rendering" });
      const outPdf = path.join(job.dir, "out.pdf");
      const result = renderDocument(template, stylePath, inFile, job.dir, outPdf);

      if (result.status === "ok") {
        store.update(job.id, { status: "done" });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                job_id: job.id,
                download_url: `${baseUrl}/download/${downloadToken}`,
                expires_at: new Date(job.expiresAt).toISOString(),
              }),
            },
          ],
        };
      }

      const errSummary = result.error?.summary;
      store.update(job.id, {
        status: "error",
        ...(errSummary !== undefined && { errorSummary: errSummary }),
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ status: "error", error: result.error }) },
        ],
      };
    },
  };
}
