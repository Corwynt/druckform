import { spawnSync } from "node:child_process";
import type {
  TemplatesContract,
  ComponentsContract,
  LintContract,
  RenderContract,
} from "druckform";

function run(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  // Read env var at call time so tests can set it in beforeAll
  const binRaw = process.env["DRUCK_BIN"] ?? "druck";
  const binParts = binRaw.split(" ");
  const cmd = binParts[0] ?? "druck";
  const cmdArgs = binParts.slice(1);

  const result = spawnSync(cmd, [...cmdArgs, ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function listTemplates(): TemplatesContract {
  const { stdout } = run(["templates"]);
  return JSON.parse(stdout) as TemplatesContract;
}

export function listComponents(template: string): ComponentsContract {
  const { stdout } = run(["components", "--template", template]);
  return JSON.parse(stdout) as ComponentsContract;
}

export function lintDocument(
  template: string,
  inFile: string,
  stylePath: string,
): LintContract {
  const { stdout } = run(["lint", "--template", template, "--in", inFile, "--style", stylePath]);
  return JSON.parse(stdout) as LintContract;
}

export function renderDocument(
  template: string,
  stylePath: string,
  inFile: string,
  assetsDir: string,
  outPdf: string,
): RenderContract {
  const result = run([
    "render",
    "--template", template,
    "--style", stylePath,
    "--in", inFile,
    "--assets", assetsDir,
    "--out", outPdf,
  ]);
  return JSON.parse(result.stdout) as RenderContract;
}
