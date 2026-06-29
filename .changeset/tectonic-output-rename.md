---
"druckform": patch
---

Fix render output path: Tectonic names its PDF after the input stem (`document.pdf`) and ignores the requested `--out` filename, so the rendered PDF was written to the wrong path. `runTectonic` now renames the produced file to the requested output path, so `druck render --out <file>` and the MCP `finalize_job` / download step find the PDF where they expect it.
