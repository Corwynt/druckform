import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { componentsCommand } from "./commands/components.js";
import { doctorCommand } from "./commands/doctor.js";
import { lintCommand } from "./commands/lint.js";
import { mcpCommand } from "./commands/mcp.js";
import { previewComponentCommand } from "./commands/preview-component.js";
import { renderCommand } from "./commands/render.js";
import { newComponent, newTemplate } from "./commands/scaffold.js";
import { templatesCommand } from "./commands/templates.js";

yargs(hideBin(process.argv))
  .scriptName("druck")
  .usage("$0 <command> [options]")
  .command(
    "templates",
    "List available templates",
    (y) => y.option("json", { type: "boolean", default: false }),
    (argv) => {
      templatesCommand(argv.json);
    },
  )
  .command(
    "components",
    "List resolved components for a template",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await componentsCommand(argv.template, argv.json);
    },
  )
  .command(
    "lint",
    "Validate a document against its template",
    (y) =>
      y
        .option("template", { alias: "t", type: "string" })
        .option("in", { type: "string", demandOption: true })
        .option("style", { type: "string" })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await lintCommand(argv.template, argv.in, argv.style, argv.json);
    },
  )
  .command(
    "doctor",
    "Validate a template's components and config (authoring lint)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await doctorCommand(argv.template, argv.json);
    },
  )
  .command(
    "render",
    "Render a document to PDF (produce a Druckform)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string" })
        .option("style", { type: "string" })
        .option("in", { type: "string", demandOption: true })
        .option("assets", { type: "string", default: "." })
        .option("out", { type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await renderCommand(argv.template, argv.style, argv.in, argv.assets, argv.out, argv.json);
    },
  )
  .command(
    "preview-component",
    "Render a single component with sample params to a PDF (fast author loop)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("name", { type: "string", demandOption: true })
        .option("params", { type: "string", describe: "JSON object of component params" })
        .option("children", { type: "string", describe: "Markdown body for the component" })
        .option("style", { type: "string" })
        .option("out", { type: "string", demandOption: true })
        .option("watch", { type: "boolean", default: false })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await previewComponentCommand(
        argv.template,
        argv.name,
        argv.params,
        argv.children,
        argv.style,
        argv.out,
        argv.json,
        argv.watch,
      );
    },
  )
  .command(
    "mcp",
    "Start the MCP server (requires druckform-mcp installed)",
    () => {},
    () => {
      mcpCommand();
    },
  )
  .command(
    "new <kind>",
    "Scaffold a template or component",
    (y) =>
      y
        .positional("kind", { choices: ["template", "component"] as const, demandOption: true })
        .option("name", { type: "string", demandOption: true })
        .option("template", { type: "string", describe: "target template (for kind=component)" })
        .option("extends", { type: "string", describe: "parent template (for kind=template)" })
        .option("format", { choices: ["ts", "yaml"] as const, default: "ts" })
        .option("accepts-children", { type: "boolean", default: false })
        .option("json", { type: "boolean", default: false }),
    (argv) => {
      if (argv.kind === "template") {
        const { file } = newTemplate({
          name: argv.name,
          ...(argv.extends ? { extends: argv.extends } : {}),
        });
        if (argv.json) {
          process.stdout.write(`${JSON.stringify({ created: [file] })}\n`);
        } else {
          console.log(`✓ Created template ${file}`);
        }
      } else {
        if (!argv.template) throw new Error("--template is required for: druck new component");
        const { file, test } = newComponent({
          template: argv.template,
          name: argv.name,
          kind: argv.format as "ts" | "yaml",
          acceptsChildren: argv["accepts-children"],
        });
        if (argv.json) {
          const created = test ? [file, test] : [file];
          process.stdout.write(`${JSON.stringify({ created })}\n`);
        } else {
          console.log(`✓ Created component ${file}${test ? ` (+ test ${test})` : ""}`);
        }
      }
    },
  )
  .demandCommand(1, "Specify a subcommand.")
  .strict()
  .help()
  .parse();
