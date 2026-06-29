import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Job } from "./types.js";

function getJobsBase(): string {
  return process.env.DRUCKFORM_JOBS_DIR ?? "/work/jobs";
}

function getMaxJobs(): number {
  return Number.parseInt(process.env.DRUCKFORM_MAX_JOBS ?? "10", 10);
}

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

export class JobStore {
  private jobs = new Map<string, Job>();
  private reapInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Reap expired jobs every 5 minutes
    this.reapInterval = setInterval(() => this.reap(), 5 * 60 * 1000);
    this.reapInterval.unref(); // don't prevent process exit
  }

  create(template: string, style: string, uploadToken: string, downloadToken: string): Job {
    const { id, dir, now } = this.allocate();
    const job: Job = {
      id,
      status: "pending",
      template,
      style,
      dir,
      uploadToken,
      downloadToken,
      uploadUsed: false,
      downloadUsed: false,
      expiresAt: now + JOB_TTL_MS,
      createdAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  /** Create a job for the inline (no-upload) render path: a job dir + a download token. */
  createInline(template: string | undefined, downloadToken: string): Job {
    const { id, dir, now } = this.allocate();
    const job: Job = {
      id,
      status: "pending",
      template: template ?? "",
      style: "",
      dir,
      uploadToken: "",
      downloadToken,
      uploadUsed: true, // no upload step for the inline path
      downloadUsed: false,
      expiresAt: now + JOB_TTL_MS,
      createdAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  // Reap, enforce the concurrency cap, and allocate a fresh job dir.
  private allocate(): { id: string; dir: string; now: number } {
    this.reap();
    const active = [...this.jobs.values()].filter(
      (j) => j.status !== "done" && j.status !== "error",
    );
    const maxJobs = getMaxJobs();
    if (active.length >= maxJobs) {
      throw new Error(`Maximum concurrent jobs (${maxJobs}) reached. Try again later.`);
    }
    const id = crypto.randomUUID();
    const dir = path.join(getJobsBase(), id);
    fs.mkdirSync(dir, { recursive: true });
    return { id, dir, now: Date.now() };
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Job>): void {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    Object.assign(job, patch);
  }

  private reap(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.expiresAt < now) {
        fs.rmSync(job.dir, { recursive: true, force: true });
        this.jobs.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.reapInterval);
  }
}
