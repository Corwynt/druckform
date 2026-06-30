import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/latex/tectonic.js", () => ({
  runTectonic: vi.fn().mockReturnValue({ ok: true, log: "" }),
}));

import { renderCommand } from "../../src/commands/render.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const TEMPLATES = path.join(FIXTURES, "templates");
const LOGO_DIR = path.join(TEMPLATES, "logotheme");

afterEach(() => vi.restoreAllMocks());

describe("template-bundled assets end-to-end", () => {
  it("emits the absolute bundled-logo path into the document .tex", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = TEMPLATES;

    // Capture the document.tex content the composer writes before tectonic runs.
    const real = fs.writeFileSync;
    let texContent = "";
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, ...rest) => {
      if (String(file).endsWith("document.tex")) texContent = String(data);
      return (real as unknown as typeof fs.writeFileSync)(file, data as never, ...(rest as []));
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const outPdf = path.join(import.meta.dirname, "../../dist/test-assets-output.pdf");
    await renderCommand(
      "logotheme",
      undefined,
      path.join(FIXTURES, "documents/valid.md"),
      FIXTURES,
      outPdf,
      true, // --json
    );

    expect(texContent).toContain(`% logo=${path.join(LOGO_DIR, "logo.pdf")}`);
    expect(texContent).toContain(`% dir=${LOGO_DIR}`);

    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  });
});
