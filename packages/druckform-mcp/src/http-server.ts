import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import type { JobStore } from "./job-store.js";
import { consumeToken, validateToken } from "./url-tokens.js";

const MAX_UPLOAD_BYTES = 55 * 1024 * 1024; // 55 MB

export function createHttpServer(store: JobStore) {
  const app = Fastify({ logger: false });

  // Allow any content type for binary uploads without consuming the stream.
  // Calling done(null, null) without reading _payload leaves req.raw intact
  // so the route handler can pipe it directly to disk.
  app.addContentTypeParser("*", (_req, _payload, done) => done(null, null));

  // PUT /upload/:token — receive zip bundle
  app.put<{ Params: { token: string } }>("/upload/:token", async (req, reply) => {
    const { token } = req.params;
    const validation = validateToken(token, "upload");
    if (!validation.valid) {
      return reply.code(401).send({ error: validation.reason });
    }

    const job = store.get(validation.jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.uploadUsed) return reply.code(409).send({ error: "Upload token already used" });

    // Claim the slot synchronously before suspending on await to prevent race condition
    store.update(job.id, { uploadUsed: true });

    const zipPath = path.join(job.dir, "bundle.zip");
    const writeStream = fs.createWriteStream(zipPath);
    let bytesReceived = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        req.raw.on("data", (chunk: Buffer) => {
          bytesReceived += chunk.length;
          if (bytesReceived > MAX_UPLOAD_BYTES) {
            req.raw.destroy();
            writeStream.destroy();
            reject(new Error(`Upload exceeds maximum size (${MAX_UPLOAD_BYTES} bytes)`));
          }
        });
        req.raw.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      if (msg.includes("exceeds maximum size")) {
        return reply.code(413).send({ error: msg });
      }
      throw e;
    }

    consumeToken(token);
    store.update(job.id, { status: "uploaded" });
    return reply.code(200).send({ ok: true });
  });

  // GET /download/:token — serve the rendered PDF
  app.get<{ Params: { token: string } }>("/download/:token", async (req, reply) => {
    const { token } = req.params;
    const validation = validateToken(token, "download");
    if (!validation.valid) {
      return reply.code(401).send({ error: validation.reason });
    }

    const job = store.get(validation.jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.status !== "done") {
      return reply.code(409).send({ error: `Job status is '${job.status}', not 'done'` });
    }

    const pdfPath = path.join(job.dir, "out.pdf");
    if (!fs.existsSync(pdfPath)) {
      return reply.code(404).send({ error: "PDF not found" });
    }

    consumeToken(token);
    store.update(job.id, { downloadUsed: true });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", 'attachment; filename="document.pdf"');
    return reply.send(fs.createReadStream(pdfPath));
  });

  return app;
}

export async function startHttpServer(
  store: JobStore,
  port = 7331,
): Promise<{ url: string; close: () => Promise<void>; boundHost: string }> {
  const app = createHttpServer(store);
  const host = process.env.DRUCKFORM_HTTP_BIND ?? "0.0.0.0";
  await app.listen({ port, host });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => app.close(),
    boundHost: host,
  };
}
