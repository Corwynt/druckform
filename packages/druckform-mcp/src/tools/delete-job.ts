import { z } from "zod";
import type { JobStore } from "../job-store.js";

const schema = z.object({ job_id: z.string() });

export function makeDeleteJobTool(store: JobStore) {
  return {
    name: "delete_job",
    description: "Delete a job and its working directory (files, assets, rendered PDF).",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    handler: async (args: unknown) => {
      const { job_id } = schema.parse(args);
      if (!store.get(job_id)) throw new Error(`Job not found: ${job_id}`);
      store.delete(job_id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ status: "deleted", job_id }) }],
      };
    },
  };
}
