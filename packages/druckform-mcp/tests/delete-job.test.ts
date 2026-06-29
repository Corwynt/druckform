import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobStore } from "../src/job-store.js";
import { makeDeleteJobTool } from "../src/tools/delete-job.js";

let store: JobStore;

beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "del-"));
  store = new JobStore();
});
afterEach(() => store.destroy());

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeDeleteJobTool(store);
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("delete_job", () => {
  it("removes the job and its dir", async () => {
    const job = store.create("base", "s.yaml", "u", "d");
    const out = await call({ job_id: job.id });
    expect(out.status).toBe("deleted");
    expect(store.get(job.id)).toBeUndefined();
    expect(fs.existsSync(job.dir)).toBe(false);
  });

  it("errors for an unknown job", async () => {
    await expect(call({ job_id: "nope" })).rejects.toThrow(/not found/i);
  });
});
