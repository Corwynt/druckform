import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { JobStore } from "../src/job-store.js";

beforeEach(() => {
  process.env["DRUCKFORM_JOBS_DIR"] = path.join(os.tmpdir(), `jobs-${Date.now()}`);
  process.env["DRUCKFORM_MAX_JOBS"] = "3";
});

afterEach(() => {
  delete process.env["DRUCKFORM_JOBS_DIR"];
  delete process.env["DRUCKFORM_MAX_JOBS"];
});

describe("JobStore", () => {
  it("creates a job and assigns an id and dir", () => {
    const store = new JobStore();
    const job = store.create("base", "style.yaml", "uptok", "dltok");
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.dir).toContain(job.id);
    store.destroy();
  });

  it("throws when max concurrent jobs is reached", () => {
    const store = new JobStore();
    store.create("base", "s.yaml", "u1", "d1");
    store.create("base", "s.yaml", "u2", "d2");
    store.create("base", "s.yaml", "u3", "d3");
    expect(() => store.create("base", "s.yaml", "u4", "d4")).toThrow("Maximum concurrent");
    store.destroy();
  });

  it("updates job status", () => {
    const store = new JobStore();
    const job = store.create("base", "s.yaml", "up", "dl");
    store.update(job.id, { status: "uploaded" });
    expect(store.get(job.id)?.status).toBe("uploaded");
    store.destroy();
  });

  it("reaps expired jobs", () => {
    const store = new JobStore();
    const job = store.create("base", "s.yaml", "up", "dl");
    // Force expiry
    store.update(job.id, { expiresAt: Date.now() - 1 });
    // Trigger reap by creating another job
    store.create("base", "s.yaml", "up2", "dl2");
    expect(store.get(job.id)).toBeUndefined();
    store.destroy();
  });
});
