import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { JobStore } from "../src/job-store.js";
import { generateToken, clearTokensForTest } from "../src/url-tokens.js";
import { createHttpServer } from "../src/http-server.js";

let store: JobStore;

beforeEach(() => {
  process.env["DRUCKFORM_JOBS_DIR"] = fs.mkdtempSync(path.join(os.tmpdir(), "http-test-"));
  store = new JobStore();
});

afterEach(() => {
  store.destroy();
  clearTokensForTest();
});

describe("HTTP server", () => {
  it("rejects upload with an unknown token", async () => {
    const app = createHttpServer(store);
    const res = await app.inject({
      method: "PUT",
      url: "/upload/invalid-token",
      payload: Buffer.from("data"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts upload with a valid token and marks job as uploaded", async () => {
    // Create job first to get the real UUID, then generate tokens with that ID
    const job = store.create("base", "style.yaml", "placeholder-upload", "placeholder-download");
    const uploadToken = generateToken(job.id, "upload");
    const downloadToken = generateToken(job.id, "download");
    store.update(job.id, { uploadToken, downloadToken });

    const app = createHttpServer(store);
    const res = await app.inject({
      method: "PUT",
      url: `/upload/${uploadToken}`,
      payload: Buffer.from("fake zip content"),
    });

    expect(res.statusCode).toBe(200);
    expect(store.get(job.id)?.status).toBe("uploaded");
  });

  it("rejects download when job is not done", async () => {
    // Create job first to get the real UUID, then generate tokens with that ID
    const job = store.create("base", "style.yaml", "placeholder-upload", "placeholder-download");
    const uploadToken = generateToken(job.id, "upload");
    const downloadToken = generateToken(job.id, "download");
    store.update(job.id, { uploadToken, downloadToken });

    const app = createHttpServer(store);
    const res = await app.inject({
      method: "GET",
      url: `/download/${downloadToken}`,
    });
    expect(res.statusCode).toBe(409);
  });
});
