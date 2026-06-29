import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the CLI runner so we don't spawn druck/tectonic — exercise the tool's own logic.
vi.mock("../src/cli-runner.js", () => ({
  renderDocument: vi.fn((_t, _s, _in, _assets, outPdf) => {
    fs.writeFileSync(outPdf, "%PDF-stub", "utf8");
    return { schemaVersion: "1", status: "ok", pdf: outPdf };
  }),
}));

import { renderDocument } from "../src/cli-runner.js";
import { JobStore } from "../src/job-store.js";
import { makeRenderMarkdownTool } from "../src/tools/render-markdown.js";

const BASE = "http://127.0.0.1:9999";
let store: JobStore;

beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rm-test-"));
  store = new JobStore();
});
afterEach(() => {
  store.destroy();
  vi.clearAllMocks();
});

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeRenderMarkdownTool(store, BASE);
  const res = await tool.handler(args);
  return JSON.parse(res.content[0].text);
}

describe("render_markdown", () => {
  it("renders inline Markdown and returns a download URL (no upload)", async () => {
    const out = await call({ document: "---\ntemplate: base\n---\n# Hi" });
    expect(out.job_id).toBeTruthy();
    expect(String(out.download_url)).toContain(`${BASE}/download/`);
    expect(out.expires_at).toBeTruthy();

    const job = store.get(out.job_id as string);
    expect(job?.status).toBe("done");
    // document.md was written into the job dir
    expect(fs.existsSync(path.join(job?.dir as string, "document.md"))).toBe(true);
    // template/style passed through to the runner
    expect(renderDocument).toHaveBeenCalled();
  });

  it("writes style.yaml when style text is provided", async () => {
    const out = await call({
      document: "# Hi",
      template: "base",
      style: '$schema: style-v1\ntokens: { colors: { accent: "#111111" } }',
    });
    const job = store.get(out.job_id as string);
    expect(fs.existsSync(path.join(job?.dir as string, "style.yaml"))).toBe(true);
  });

  it("returns an error result when the render fails", async () => {
    (
      renderDocument as unknown as { mockReturnValueOnce: (v: unknown) => void }
    ).mockReturnValueOnce({
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: "boom", findings: [] },
    });
    const out = await call({ document: "# Hi", template: "base" });
    expect(out.status).toBe("error");
    expect((out.error as { summary: string }).summary).toBe("boom");
  });
});
