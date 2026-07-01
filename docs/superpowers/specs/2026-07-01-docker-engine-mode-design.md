# Docker execution engine for the `druck` CLI — design

**Date:** 2026-07-01
**Author:** torben (with Claude)
**Status:** Approved design, awaiting implementation plan

## Problem

The `druck` CLI shells out to heavy external tools — `tectonic`, `mmdc` (+ headless Chromium), `java`+`plantuml.jar`, `rsvg-convert`, plus fonts — which every user must install locally to render. druckform already ships a Docker image (`Dockerfile`) that bakes all of them in, with `druck` on `PATH`, `WORKDIR /work`, and the env wired up. We want the local `druck` to optionally **relay the whole command to that container**, so a user needs only Docker (and Node for the CLI itself) to get byte-identical renders.

## Goal

Add an execution-engine layer to `druck`: run the pipeline **locally** (as today) or **relay the whole command to the Docker image**, chosen automatically when local tools are missing and overridable explicitly. Keep `druck` as the single npm binary (no separate shell wrapper). Refocus the skills on the CLI (the CLI now self-provisions), removing MCP from the skills.

## Non-goals (YAGNI)

- A separate shell-script `druck`. One npm binary with an engine mode.
- Per-tool relaying. Docker mode relays the **entire command**; the container runs the whole pipeline.
- Per-command tool-subset detection for `auto` (a plain-Markdown render technically needs no diagram tools). `auto` uses a single global toolset check per the agreed rule.
- Windows-specific path-mapping polish. Identity mounts target macOS/Linux first; document the Windows limitation.
- Removing the MCP server. It stays and keeps working; it's just de-emphasized in the skills.

## Design

### Engines and selection

Three engines: `local`, `docker`, `auto`. Selection precedence (first wins):
1. `--engine local|docker` CLI flag
2. `DRUCK_ENGINE` env (`local|docker|auto`)
3. default: **`auto`**

Engine selection applies **only to tool-using commands** — `render` and `preview-component`. The pure-JS commands (`templates`, `components`, `lint`, `doctor`, `new <kind>`, `mcp`) invoke no external tools and **always run locally**, regardless of engine. (The `mcp` command starts the server locally; the render calls it makes shell `druck render`, which then does its own engine selection — so MCP renders inherit Docker mode for free.)

- **`local` (forced):** run the pipeline in-process. **No pre-probe** and **no report** — fail lazily, only when a genuinely-needed tool is missing, with a guiding message: *"`tectonic` not found — install it, or set `DRUCK_ENGINE=docker` (or `--engine docker`) to run in the bundled container."*
- **`docker` (forced):** relay to the container unconditionally; no probe.
- **`auto` (default):** probe the external toolset once at startup, print a found/missing report to **stderr**, then decide: **all present → local; any missing → docker**. If Docker is selected but the `docker` binary is not available, fail with a clear message listing the missing tools and telling the user to install either the tools or Docker.

### Tool probe + boot report

Probed tools (resolved on `PATH`): `tectonic`, `rsvg-convert`, `mmdc`, `java` (the PlantUML driver). Probe by resolving the executable (e.g. `command -v` / `which` semantics, or a cheap `--version` spawn); do not run a render.

The report is a compact block printed to **stderr** (so `--json` stdout stays clean), e.g.:

```
druck: engine=auto → docker (missing tools below)
  ✓ tectonic       /usr/local/bin/tectonic
  ✓ rsvg-convert   /opt/homebrew/bin/rsvg-convert
  ✗ mmdc           not found
  ✗ java           not found
```

When all are present the report shows `engine=auto → local` with all ✓.

### Docker relay mechanics

When the engine resolves to `docker` for a tool-using command:

1. **Rebuild argv:** take the original command + options, strip the `--engine` flag, and pass the rest through unchanged to the container's `druck` (the image `ENTRYPOINT` is `druck`).
2. **Identity mounts for paths:** resolve every path-bearing argument to an absolute host path — `--in`, `--out`, `--assets`, `--style`, and the `DRUCKFORM_TEMPLATES_DIR` env — then mount each unique parent directory at the **same absolute path** inside the container (`-v /abs/dir:/abs/dir`), and set `-w` to the current working directory. Because in-container paths equal host paths, the passed-through args need **no rewriting**. The `--out` parent directory is mounted read-write. When `DRUCKFORM_TEMPLATES_DIR` is set, mount it (identity) and forward it with `-e DRUCKFORM_TEMPLATES_DIR=<same path>`.
3. **Invocation:** `docker run --rm [-i] <image> <rebuilt-argv>`. No TTY (`-t`) — keeps stdout clean and non-interactive. Stream the container's stdout/stderr through; the tool report and Docker's own chatter go to stderr.
4. **Exit code:** propagate the container's exit code as `druck`'s exit code.

### Image reference

Baked-in default: **`ghcr.io/druckform/druckform:<cli-version>`**, where `<cli-version>` is the CLI's own package version (so the relay stays in lockstep with the CLI's arg surface — CLI 0.1.0 → image tag `0.1.0`). Overridable via the **`DRUCK_DOCKER_IMAGE`** env (full ref, including tag if desired). The CLI resolves its own version at build time (tsup-injected constant) or by reading its `package.json`; the plan picks the mechanism.

### CLI integration point

Add an engine layer invoked from `cli.ts` for the two tool-using commands. Cleanest shape: a small `resolveEngine()` (reads flag/env, runs the probe for `auto`, prints the report) and a `relayToDocker(argv)` (builds the mount set + `docker run`, streams, returns exit code). In the `render` and `preview-component` yargs handlers (or a shared pre-step), if the resolved engine is `docker`, relay and exit; otherwise call the existing local handler. Add a global `--engine` option. Keep the change isolated to a new `src/engine/` module + thin wiring in `cli.ts`; the command handlers themselves are unchanged for the local path.

### Skills & docs

- **Rewrite** `claude-plugin/skills/druckform/SKILL.md` and `claude-plugin/skills/druckform-authoring/SKILL.md` to CLI-only workflows: agents drive `druck …`, which self-provisions (local or Docker) — no environment setup required. **Remove the MCP tool tables/guidance** from both skills.
- **Docs:** keep a brief note in `docs/extending-druckform.md` (and/or `docs/authoring.md`) that an MCP server exists as an alternative integration, pointing at its usage — but the primary, documented path is the CLI. Document the new engine model (`--engine`, `DRUCK_ENGINE`, `DRUCK_DOCKER_IMAGE`, the auto rule and boot report).

## Testing

- **Engine resolver:** precedence (`--engine` > `DRUCK_ENGINE` > default `auto`); `auto` decision from a probe result (all-present → local, any-missing → docker); forced `local` skips probing; forced `docker` skips probing.
- **Tool prober:** returns per-tool found/path vs missing given a mocked resolver; report formatting.
- **Docker arg-builder (pure function, the core unit):** given a parsed command + resolved paths, produces the correct `docker run` argv — identity `-v` mounts for each unique parent dir (deduped), `-w`, `-e DRUCKFORM_TEMPLATES_DIR` when set, the image ref (default + `DRUCK_DOCKER_IMAGE` override), and the pass-through argv with `--engine` stripped. Edge cases: relative vs absolute input paths, `--out` in a different dir than `--in`, no `DRUCKFORM_TEMPLATES_DIR`.
- **Relay execution:** mock `spawnSync`/`spawn` for `docker`; assert exit-code propagation and that stdout is not polluted by the report. No real Docker in tests; a real end-to-end container run is an optional integration check gated on Docker availability.
- **Scoping:** pure commands (`components`, etc.) never relay even when tools are absent (engine layer not consulted).

## Affected files (anticipated)

- Create: `packages/druckform/src/engine/` — `resolve-engine.ts` (precedence + auto), `probe-tools.ts` (+ report), `docker-relay.ts` (arg-builder + runner).
- Modify: `packages/druckform/src/cli.ts` — global `--engine` option; wire the engine layer into the `render` and `preview-component` handlers.
- Modify: `packages/druckform/package.json` / `tsup.config.ts` — expose the CLI version to the binary (for the default image tag), if a build-time constant is used.
- Modify: `claude-plugin/skills/druckform/SKILL.md`, `claude-plugin/skills/druckform-authoring/SKILL.md` — CLI-first, MCP removed.
- Modify: `docs/extending-druckform.md` (+ `docs/authoring.md` as needed) — engine model docs; brief MCP mention.
- Tests under `packages/druckform/tests/` per the Testing section.

## Deferred / notes

- Windows identity-mount path translation (drive letters) — documented limitation for now.
- Publishing the GHCR image (`ghcr.io/druckform/druckform`) and its CI is a separate task; this spec assumes the image exists at the versioned tag when Docker mode runs (Docker will error clearly if the tag can't be pulled).
- A future `auto` refinement could scope the toolset to what a given document actually needs (only probe `mmdc`/`java` if the doc contains those diagram fences); out of scope here.
