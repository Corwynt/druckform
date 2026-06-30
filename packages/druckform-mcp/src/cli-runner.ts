import { spawnSync } from "node:child_process";
import type {
  ComponentsContract,
  LintContract,
  RenderContract,
  TemplatesContract,
} from "druckform";

function run(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  // Read env var at call time so tests can set it in beforeAll
  const binRaw = process.env.DRUCK_BIN ?? "druck";
  const binParts = binRaw.split(" ");
  const cmd = binParts[0] ?? "druck";
  const cmdArgs = binParts.slice(1);

  const result = spawnSync(cmd, [...cmdArgs, ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runOrThrow(args: string[]): string {
  const { ok, stdout, stderr } = run(args);
  if (!ok) {
    throw new Error(`druck ${args[0]} failed: ${stderr || "empty output"}`);
  }
  return stdout;
}

export function listTemplates(): TemplatesContract {
  return JSON.parse(runOrThrow(["templates"])) as TemplatesContract;
}

export function listComponents(template: string): ComponentsContract {
  return JSON.parse(runOrThrow(["components", "--template", template])) as ComponentsContract;
}

export function lintDocument(template: string, inFile: string, stylePath: string): LintContract {
  return JSON.parse(
    runOrThrow(["lint", "--template", template, "--in", inFile, "--style", stylePath]),
  ) as LintContract;
}

export function previewComponent(
  template: string,
  name: string,
  params: Record<string, string> | undefined,
  children: string | undefined,
  outPdf: string,
): RenderContract {
  const args = ["preview-component", "--template", template, "--name", name, "--out", outPdf];
  if (params && Object.keys(params).length > 0) args.push("--params", JSON.stringify(params));
  if (children !== undefined) args.push("--children", children);
  const { stdout, stderr } = run(args);
  try {
    return JSON.parse(stdout) as RenderContract;
  } catch {
    throw new Error(
      `druck preview-component produced no parseable contract: ${stderr || stdout || "(empty)"}`,
    );
  }
}

export function doctorTemplate(template: string): LintContract {
  const { stdout, stderr } = run(["doctor", "--template", template]);
  try {
    return JSON.parse(stdout) as LintContract;
  } catch {
    throw new Error(
      `druck doctor produced no parseable contract: ${stderr || stdout || "(empty)"}`,
    );
  }
}

export function newComponent(
  template: string,
  name: string,
  kind: "ts" | "yaml",
  acceptsChildren: boolean,
): { created: string[] } {
  const args = ["new", "component", "--template", template, "--name", name, "--format", kind];
  if (acceptsChildren) args.push("--accepts-children");
  return JSON.parse(runOrThrow(args)) as { created: string[] };
}

export function newTemplate(name: string, extendsName?: string): { created: string[] } {
  const args = ["new", "template", "--name", name];
  if (extendsName) args.push("--extends", extendsName);
  return JSON.parse(runOrThrow(args)) as { created: string[] };
}

export function renderDocument(
  template: string | undefined,
  stylePath: string | undefined,
  inFile: string,
  assetsDir: string,
  outPdf: string,
): RenderContract {
  const args = ["render", "--in", inFile, "--assets", assetsDir, "--out", outPdf];
  if (template) args.push("--template", template);
  if (stylePath) args.push("--style", stylePath);
  // `druck render` exits 1 on render errors but always writes a JSON RenderContract
  // to stdout — so parse stdout regardless of exit code rather than throwing.
  const { stdout, stderr } = run(args);
  try {
    return JSON.parse(stdout) as RenderContract;
  } catch {
    throw new Error(
      `druck render produced no parseable contract: ${stderr || stdout || "(empty)"}`,
    );
  }
}
