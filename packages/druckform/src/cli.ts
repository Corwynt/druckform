import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { componentsCommand } from "./commands/components.js";
import { lintCommand } from "./commands/lint.js";
import { mcpCommand } from "./commands/mcp.js";
import { renderCommand } from "./commands/render.js";
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
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("in", { type: "string", demandOption: true })
        .option("style", { type: "string" })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await lintCommand(argv.template, argv.in, argv.style, argv.json);
    },
  )
  .command(
    "render",
    "Render a document to PDF (produce a Druckform)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("style", { type: "string", demandOption: true })
        .option("in", { type: "string", demandOption: true })
        .option("assets", { type: "string", default: "." })
        .option("out", { type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await renderCommand(argv.template, argv.style, argv.in, argv.assets, argv.out, argv.json);
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
  .demandCommand(1, "Specify a subcommand.")
  .strict()
  .help()
  .parse();
