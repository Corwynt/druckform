import { z } from "zod";
import path from "node:path";
import { lintDocument } from "../cli-runner.js";
import type { JobStore } from "../job-store.js";

const schema = z.object({ job_id: z.string() });

export function makeValidateDocumentTool(store: JobStore) {
  return {
    name: "validate_document",
    description: "Validate the uploaded document against its template (lint pass).",
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

      const inFile = path.join(job.dir, "document.md");
      const stylePath = path.join(job.dir, job.style);

      const result = lintDocument(job.template, inFile, stylePath);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  };
}
