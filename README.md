# Druckform

Convert AI-authored Markdown into styled PDFs via LaTeX. Two packages in a TypeScript monorepo, distributed as a Docker image and on npm.

- **`druckform`** — render engine CLI (`druck` / `druckform` binaries)
- **`druckform-mcp`** — MCP server adapter for Claude Code

## Quick start (Docker)

```bash
# Render a document
docker run --rm \
  -v "$(pwd):/work" \
  ghcr.io/corwynt/druckform:latest \
  render --template base --style /work/style.yaml --in /work/document.md --out /work/out.pdf
```

Mount your working directory to `/work`. The `--template`, `--style`, `--in`, and `--out` paths should be absolute (inside the container).

See [docs/authoring.md](docs/authoring.md) for the document format and available components.

## Using with Claude Code

Install the druckform Claude Code plugin:

```
/plugin marketplace add corwynt/druckform
/plugin install druckform@druckform
```

This auto-configures the druckform MCP server (via Docker) and adds the `/druckform:druckform` skill.

**Requirements:** Docker must be running. curl and zip must be available in your session PATH.

See [docs/authoring.md](docs/authoring.md) for the document format and [the skill](claude-plugin/skills/druckform/SKILL.md) for the MCP workflow.

## CLI reference

```
druck templates [--json]
druck components --template <name> [--json]
druck lint     --template <name> --in <file> [--style <file>] [--json]
druck render   --template <name> --style <file> --in <file> --out <file> [--json]
druck mcp      # start MCP + HTTP server on stdio
```

Use `--json` to get machine-readable output on stdout.

## npm install

```bash
npm install -g druckform druckform-mcp
```

Requires Node.js ≥ 22 and system dependencies: Tectonic (LaTeX), JRE (PlantUML), Graphviz, Chromium (mermaid), and librsvg2.

Use the Docker image unless you need to run in a CI environment that already provides these tools.

## Documentation

- [Authoring guide](docs/authoring.md) — document format, components, styles, templates
- [Extending guide](docs/extending.md) — adding components, templates, themes; contributing

## Development

```bash
pnpm install
pnpm turbo build
pnpm turbo test
```

Requires pnpm ≥ 9, Node.js ≥ 22.

## Testing the CLI locally with Claude Code

To try your local build against a separate Claude Code instance — instead of the published Docker image wired up by the plugin — point Claude at the freshly built CLI's MCP server.

1. **Build the packages** so the CLI binary exists:

   ```bash
   pnpm install
   pnpm turbo build
   ```

   This produces two files you'll need: `packages/druckform-mcp/dist/index.js` (the MCP + HTTP server entry point) and `packages/druckform/dist/cli.js` (the render engine). (The published Docker image runs `druck mcp`, which just spawns the globally-installed `druckform-mcp` binary — in a local checkout that binary isn't on your `PATH`, so point Claude at the built file directly.)

2. **Register the local server** in the Claude Code instance you want to test with. The MCP server shells out to the `druck` CLI, which isn't on your `PATH` in a checkout, so set `DRUCK_BIN` to the built CLI. From the directory you're testing in:

   ```bash
   claude mcp add druckform-local \
     -e DRUCK_BIN="node /ABS/PATH/druckform/packages/druckform/dist/cli.js" \
     -e DRUCKFORM_JOBS_DIR="$HOME/.druckform/jobs" \
     -- node /ABS/PATH/druckform/packages/druckform-mcp/dist/index.js
   ```

   `DRUCKFORM_JOBS_DIR` overrides the server's job working directory — it defaults to `/work/jobs`, which only exists inside the Docker container, so locally you must point it at a writable path (create it first: `mkdir -p ~/.druckform/jobs`). Use the absolute path to your checkout. Alternatively, add a `.mcp.json` to the test project:

   ```json
   {
     "mcpServers": {
       "druckform": {
         "command": "node",
         "args": ["/ABS/PATH/druckform/packages/druckform-mcp/dist/index.js"],
         "env": {
           "DRUCK_BIN": "node /ABS/PATH/druckform/packages/druckform/dist/cli.js",
           "DRUCKFORM_JOBS_DIR": "/ABS/PATH/home/.druckform/jobs"
         }
       }
     }
   }
   ```

3. **Symlink the skill** so Claude gets the authoring workflow alongside the MCP tools (otherwise only the raw tools are available). Claude Code discovers skills under `.claude/skills/`, so link the skill directory into the test project (or `~/.claude/skills/` to make it available everywhere):

   ```bash
   # project-level (just this test project)
   mkdir -p .claude/skills
   ln -s /ABS/PATH/druckform/claude-plugin/skills/druckform .claude/skills/druckform

   # — or — user-level (all projects)
   mkdir -p ~/.claude/skills
   ln -s /ABS/PATH/druckform/claude-plugin/skills/druckform ~/.claude/skills/druckform
   ```

   A symlink means edits to `SKILL.md` in your checkout show up immediately — no copy to keep in sync.

4. **Start Claude Code** in that project and confirm the `druckform` MCP tools are listed (`/mcp`) and the skill is picked up (`/druckform` or `/help`). Ask it to render a document; the tool calls now hit your local build instead of `ghcr.io/corwynt/druckform`.

Rebuild (`pnpm turbo build`) and restart the MCP server after code changes.

> Tip: to exercise the CLI directly without Claude, call the built binary — e.g. `node packages/druckform/dist/cli.js templates --json` or `... render --template base --style style.yaml --in document.md --out out.pdf`.

**Troubleshooting `Failed to reconnect … -32000`:** the server crashed on startup. The two common causes:

- **Port already in use.** By default (`DRUCKFORM_HTTP_PORT=0`) the server binds an OS-assigned ephemeral port on launch, so concurrent instances don't clash and `EADDRINUSE` should not occur. If you pin a fixed port via `DRUCKFORM_HTTP_PORT` and another instance already holds it, startup fails with `EADDRINUSE` — free the port or choose another (and use `DRUCKFORM_HTTP_BIND` to change the bind host). With `claude mcp add`, pass it via `-e DRUCKFORM_HTTP_PORT=7332`.
- **Wrong entry point.** Make sure you registered `packages/druckform-mcp/dist/index.js`, not `cli.js mcp` — the latter needs `druckform-mcp` on your `PATH`.

To see the actual error, run the entry point by hand: `node packages/druckform-mcp/dist/index.js` — it logs the listening URL or the crash.

**Troubleshooting `druck … failed: spawnSync druck ENOENT`:** the MCP server couldn't find the `druck` CLI. Either set `DRUCK_BIN` as shown in step 2, or put `druck` on your `PATH` by symlinking the built binary (it has a shebang and is executable):

```bash
ln -sf /ABS/PATH/druckform/packages/druckform/dist/cli.js ~/.local/bin/druck
```

**Troubleshooting `ENOENT … mkdir '/work/jobs/...'`:** the server is using its container default job directory. Set `DRUCKFORM_JOBS_DIR` to a writable local path (`mkdir -p ~/.druckform/jobs` first), as shown in step 2.

> **The MCP server only reads its env/PATH when it launches.** After changing the config (`DRUCK_BIN`, port) or the PATH, you must reconnect the server — `/mcp` → reconnect, or restart the Claude session. Retrying a failed tool call reuses the same already-running server and will keep failing. Note that a Claude instance started from the macOS GUI app may not inherit your shell `PATH` (so `~/.local/bin` won't be visible) — launch `claude` from a terminal, or rely on the absolute `DRUCK_BIN`.

### System dependencies

Rendering shells out to external tools, so a local (non-Docker) setup needs these on your `PATH`:

| Tool                      | Used for                    | Binary           |
| ------------------------- | --------------------------- | ---------------- |
| Node.js ≥ 22, pnpm ≥ 9    | build & run                 | `node`, `pnpm`   |
| Tectonic                  | LaTeX → PDF                 | `tectonic`       |
| JRE (Java) + PlantUML jar | PlantUML diagrams           | `java`           |
| Graphviz                  | PlantUML layout             | `dot`            |
| mermaid-cli               | Mermaid diagrams            | `mmdc`           |
| librsvg                   | SVG → PDF conversion        | `rsvg-convert`   |
| curl, zip                 | upload the document bundle  | `curl`, `zip`    |

On macOS with Homebrew:

```bash
brew install tectonic graphviz librsvg openjdk node pnpm
npm install -g @mermaid-js/mermaid-cli   # provides mmdc (downloads Chromium)
# PlantUML: download the jar, then point druckform at it
brew install plantuml   # or grab plantuml.jar manually
export PLANTUML_JAR="$(brew --prefix)/opt/plantuml/libexec/plantuml.jar"
```

`PLANTUML_JAR` defaults to `/usr/local/lib/plantuml.jar`; set it to wherever your jar lives. `curl` and `zip` ship with macOS. mermaid-cli needs Chromium — if `mmdc` can't find one, set `PUPPETEER_EXECUTABLE_PATH` to a Chromium/Chrome binary.

If installing all of this locally is impractical, use the Docker image instead — it bundles every dependency.

### Tectonic cache

The renderer runs Tectonic with network access, so on the first render Tectonic downloads the LaTeX format, packages, and Latin Modern fonts into its cache (`~/Library/Caches/Tectonic` on macOS, `~/.cache/Tectonic` on Linux). The first render is therefore slower; subsequent renders reuse the cache. The Docker image pre-warms this cache at build time so the network is only needed if a document pulls in a package the image didn't cache.

If you need fully offline / hermetic rendering, pre-warm the cache once by compiling a representative document, then run Tectonic with `--only-cached`. (The renderer no longer passes `--only-cached` itself.)

### Fonts

The bundled example style requests `Liberation Serif` / `Liberation Mono`, which the Docker image installs but a local machine usually lacks — `fontspec` then fails with *"The font … cannot be found."* Either install them (`brew install --cask font-liberation`, plus Noto) or use a style with **no `fonts` block**, which falls back to Latin Modern (bundled with Tectonic).

### Docker smoke test

To verify the published image builds and the CLI contracts hold, run the smoke test (requires Docker):

```bash
./tests/docker-smoke.sh                 # builds druckform:local and exercises the CLI
./tests/docker-smoke.sh my-image:tag    # use a custom image tag
```
