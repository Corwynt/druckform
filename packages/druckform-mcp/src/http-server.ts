import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { validateToken, consumeToken } from "./url-tokens.js";
import type { JobStore } from "./job-store.js";

export function createHttpServer(store: JobStore) {
  const app = Fastify({ logger: false });

  // Allow any content type for binary uploads without consuming the stream.
  // Calling done(null, null) without reading _payload leaves req.raw intact
  // so the route handler can pipe it directly to disk.
  app.addContentTypeParser("*", (_req, _payload, done) => done(null, null));

  // PUT /upload/:token — receive zip bundle
  app.put<{ Params: { token: string } }>(
    "/upload/:token",
    {
      config: { rawBody: true },
    },
    async (req, reply) => {
      const { token } = req.params;
      const validation = validateToken(token, "upload");
      if (!validation.valid) {
        return reply.code(401).send({ error: validation.reason });
      }

      const job = store.get(validation.jobId!);
      if (!job) return reply.code(404).send({ error: "Job not found" });
      if (job.uploadUsed) return reply.code(409).send({ error: "Upload token already used" });

      const zipPath = path.join(job.dir, "bundle.zip");
      const writeStream = fs.createWriteStream(zipPath);

      await new Promise<void>((resolve, reject) => {
        req.raw.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      consumeToken(token);
      store.update(job.id, { status: "uploaded", uploadUsed: true });
      return reply.code(200).send({ ok: true });
    },
  );

  // GET /download/:token — serve the rendered PDF
  app.get<{ Params: { token: string } }>(
    "/download/:token",
    async (req, reply) => {
      const { token } = req.params;
      const validation = validateToken(token, "download");
      if (!validation.valid) {
        return reply.code(401).send({ error: validation.reason });
      }

      const job = store.get(validation.jobId!);
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
    },
  );

  return app;
}

export async function startHttpServer(store: JobStore, port = 7331): Promise<string> {
  const app = createHttpServer(store);
  await app.listen({ port, host: "127.0.0.1" });
  return `http://127.0.0.1:${port}`;
}
