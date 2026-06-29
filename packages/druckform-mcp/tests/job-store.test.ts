import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobStore } from "../src/job-store.js";

beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = path.join(os.tmpdir(), `jobs-${Date.now()}`);
  process.env.DRUCKFORM_MAX_JOBS = "3";
});

afterEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = undefined;
  process.env.DRUCKFORM_MAX_JOBS = undefined;
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

  it("createInline makes a download-only job that counts toward the cap", () => {
    const store = new JobStore();
    const job = store.createInline("base", "dltok");
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.dir).toContain(job.id);
    expect(job.downloadToken).toBe("dltok");
    expect(job.uploadToken).toBe("");
    expect(job.uploadUsed).toBe(true);
    // counts toward the active-jobs cap (max 3)
    store.createInline("base", "d2");
    store.createInline("base", "d3");
    expect(() => store.createInline("base", "d4")).toThrow("Maximum concurrent");
    store.destroy();
  });

  it("keepAlive pushes expiry forward but not past the max lifetime", () => {
    const store = new JobStore();
    const job = store.create("base", "s.yaml", "up", "dl");
    store.update(job.id, { expiresAt: Date.now() + 1000 });
    store.keepAlive(job.id);
    const after = store.get(job.id);
    // pushed well past the +1000ms we set
    expect((after?.expiresAt ?? 0)).toBeGreaterThan(Date.now() + 60 * 1000);
    // never beyond createdAt + MAX_LIFETIME (24h)
    expect((after?.expiresAt ?? 0)).toBeLessThanOrEqual((after?.createdAt ?? 0) + 24 * 60 * 60 * 1000);
    store.destroy();
  });

  it("delete removes the job and its dir", () => {
    const store = new JobStore();
    const job = store.create("base", "s.yaml", "up", "dl");
    expect(fs.existsSync(job.dir)).toBe(true);
    store.delete(job.id);
    expect(store.get(job.id)).toBeUndefined();
    expect(fs.existsSync(job.dir)).toBe(false);
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
