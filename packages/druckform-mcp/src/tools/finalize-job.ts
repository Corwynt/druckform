import { z } from "zod";
import path from "node:path";
import { hardenedUnzip } from "../unzip.js";
import { renderDocument } from "../cli-runner.js";
import type { JobStore } from "../job-store.js";

const schema = z.object({ job_id: z.string() });

export function makeFinalizeJobTool(store: JobStore, baseUrl: string) {
  return {
    name: "finalize_job",
    description:
      "Unzip the uploaded bundle, run the render pipeline, and return the result.",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    handler: async (args: unknown) => {
      const { job_id } = schema.parse(args);
      const job = store.get(job_id);
      if (!job) throw new Error(`Job not found: ${job_id}`);
      if (job.status !== "uploaded") throw new Error(`Job must be in 'uploaded' state`);

      store.update(job_id, { status: "rendering" });

      const zipPath = path.join(job.dir, "bundle.zip");
      const unzipResult = await hardenedUnzip(zipPath, job.dir);

      if (!unzipResult.ok) {
        const errMsg = unzipResult.error;
        store.update(job_id, { status: "error", ...(errMsg !== undefined && { errorSummary: errMsg }) });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ status: "error", error: { summary: unzipResult.error, findings: [] } }),
          }],
        };
      }

      const inFile = path.join(job.dir, "document.md");
      const stylePath = path.join(job.dir, job.style);
      const assetsDir = path.join(job.dir, "assets");
      const outPdf = path.join(job.dir, "out.pdf");

      const renderResult = renderDocument(job.template, stylePath, inFile, assetsDir, outPdf);

      if (renderResult.status === "ok") {
        store.update(job_id, { status: "done" });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "ok",
              download_url: `${baseUrl}/download/${job.downloadToken}`,
            }),
          }],
        };
      } else {
        const errSummary = renderResult.error?.summary;
        store.update(job_id, { status: "error", ...(errSummary !== undefined && { errorSummary: errSummary }) });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ status: "error", error: renderResult.error }),
          }],
        };
      }
    },
  };
}
