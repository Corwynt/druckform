# Druckform — Project Design

A Docker-packaged system that turns AI-authored Markdown (with composable, schema-defined components) into styled PDFs via a LaTeX pipeline. Two npm packages in a TypeScript monorepo, distributed on npm and GHCR.

---

## 1. Monorepo Structure & Tooling

**Layout:**
```
druckform/
├── packages/
│   ├── druckform/          # engine CLI — publishes as `druckform` on npm
│   │   ├── src/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── druckform-mcp/      # MCP adapter — publishes as `druckform-mcp` on npm
│       ├── src/
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
├── .changeset/
├── docs/
│   └── superpowers/specs/
├── biome.json
├── turbo.json
├── pnpm-workspace.yaml
├── package.json            # root (private, dev tooling only)
└── tsconfig.base.json
```

**Toolchain:**
- Package manager: **pnpm workspaces**
- Build orchestration: **Turborepo** — pipeline: `typecheck → build → test`, `lint` parallel
- TypeScript build: **tsup** (tsc type-check + esbuild bundle) — emits CJS + ESM + `.d.ts`
- Linting & formatting: **Biome** (single config at root, replaces ESLint + Prettier)
- Testing: **Vitest** with `@vitest/coverage-v8`
- Release management: **Changesets** (`@changesets/cli`)

**Turborepo tasks (`turbo.json`):**
```json
{
  "pipeline": {
    "typecheck": { "dependsOn": [] },
    "build":     { "dependsOn": ["typecheck"], "outputs": ["dist/**"] },
    "test":      { "dependsOn": ["build"] },
    "lint":      { "dependsOn": [] }
  }
}
```

---

## 2. Package Architecture

Defined by the implementation spec. Summary of the contract:

### `druckform` (engine CLI)
- **Binaries:** `druck` and `druckform` (same entrypoint `dist/cli.js`)
- **Subcommands:** `templates`, `components`, `lint`, `render` — all `--json`-capable
- **Zero network surface.** Pure CLI: reads disk, writes disk, emits JSON on stdout.
- **Component system:** declarative typed-slot YAML form + TypeScript function form. Params validated via Zod. `Tex` builder escapes by construction.
- **Template inheritance:** single-parent chain, param/defaults partial-merge (type a only), resolved set exposed via `components --template`.
- **Style system:** `style-v1.json` schema, style compiler, required-token static validation before LaTeX is invoked.
- **Diagram pre-render:** mermaid (`mmdc`) and PlantUML (jar) → SVG → PDF before LaTeX stage.
- **LaTeX error mapping:** compile failures mapped to originating component + source line; summarized findings returned, raw log written to job dir only.
- **`engines`:** `{ "node": ">=22" }`

### `druckform-mcp` (MCP adapter)
- Calls `druckform` CLI as a **subprocess over the JSON contract**. No TS imports of engine internals.
- Owns: HTTP upload/download server (bound to `127.0.0.1`), job lifecycle, hardened unzip.
- **MCP tools:** `list_templates`, `list_components`, `validate_document`, `render_document`, `finalize_job`
- **Hardening:** zip-slip rejection, zip-bomb caps (entry count + uncompressed size), tokened/expiring URLs, TTL job reaping, max-concurrent-jobs cap.
- **`engines`:** `{ "node": ">=22" }`

### JSON contract (`schemaVersion: "1"`)
The stable interface between the two packages. Four shapes: templates list, components list, lint findings, render result. MCP consumes these verbatim; never second-sources them.

---

## 3. CI/CD Pipeline

Three GitHub Actions workflows:

### `ci.yml` — every push & PR
```
pnpm install
→ turbo typecheck
→ turbo lint
→ turbo build
→ turbo test (with coverage gate: 80% line)
```
- Runner: `ubuntu-latest`
- Turborepo remote cache via `TURBO_TOKEN` secret

### `release.yml` — push to `main`
```
ci passes
→ changesets/action
    → if changesets pending:  open/update "Version PR"
    → if version PR merged:   npm publish (both packages) + Docker build + push to GHCR
```
- npm publish: `NODE_AUTH_TOKEN` secret, `--provenance` flag for attestations
- Docker tags: `latest`, `1.2.3`, `1.2`
- Image: `ghcr.io/<owner>/druckform`

### `docker-build-test.yml` — PRs touching `Dockerfile` or `packages/**`
```
docker build
→ docker run druck --version
→ smoke: druck render on a fixture document
```
Catches broken Dockerfiles before merge, without publishing.

### Branch strategy
- `main` is always releasable
- Feature branches → PRs → squash merge
- Changesets PR auto-managed by the GitHub bot

---

## 4. Testing Strategy

### Engine tests (`packages/druckform/tests/`) — no MCP, no HTTP, no Docker

```
tests/
├── unit/
│   ├── resolver.test.ts        # template inheritance, partial-merge, conflict detection
│   ├── style-compiler.test.ts  # token resolution, required-token validation failures
│   ├── tex-builder.test.ts     # TeX special escaping (all 10: & % _ # $ { } ~ ^ \)
│   ├── asset-path.test.ts      # path-escape rejection (../, absolute paths)
│   └── latex-error-map.test.ts # log → component+line attribution
├── integration/
│   ├── render.test.ts          # full pipeline against fixtures, golden stdout check
│   └── lint.test.ts            # lint findings against malformed fixture docs
└── fixtures/
    ├── templates/              # base + report templates
    ├── styles/                 # example style.yaml
    ├── documents/              # valid + invalid .md fixtures
    └── golden/                 # expected --json stdout (Vitest toMatchFileSnapshot)
```

**Golden files:** cover `--json` stdout only (not the PDF binary). Regenerated with `vitest --update-snapshots`.

**Diagram tests:** mock `mmdc`/PlantUML via `$PATH` fixture stubs — no Chromium in CI.

### MCP tests (`packages/druckform-mcp/tests/`) — own surface only
- Zip-slip rejection
- Zip-bomb caps (entry count + uncompressed byte limit)
- URL token generation and expiry enforcement
- Job TTL reaping, max-concurrent-jobs cap
- Tool→CLI subprocess mapping (CLI binary stubbed via `$PATH` override)

### Coverage gate
Vitest `--coverage` via `@vitest/coverage-v8`. CI fails below **80% line coverage**. Diagram/LaTeX paths needing real binaries are excluded from the gate via coverage ignore comments.

---

## 5. Docker & Distribution

### Multi-stage Dockerfile

**Stage 1 — Node build:**
- Install pnpm, copy workspace, `pnpm install --frozen-lockfile`, `pnpm turbo build`

**Stage 2 — Runtime (`node:22-slim` base):**
- System deps: `default-jre-headless`, `graphviz`, `librsvg2-bin`, `chromium`, font packages
- Tectonic binary + pre-warm TeX package cache at image build time (slow, stable layer)
- PlantUML jar copied from build stage
- App dist files (`packages/*/dist/`) copied from build stage
- Bundled templates, components, styles, schemas copied from repo
- `WORKDIR /work`, `ENTRYPOINT ["druck"]`

**Layer ordering for cache efficiency:**
1. System deps (rarely change)
2. Tectonic + TeX pre-warm (slow, but stable)
3. PlantUML jar
4. Bundled templates/styles (changes occasionally)
5. App dist (changes on every release)

**Expected image size:** ~2–3 GB (Chromium ~400 MB, JRE ~200 MB, TeX packages ~1 GB+).

### npm distribution
- `druckform`: `bin: { druck: ./dist/cli.js, druckform: ./dist/cli.js }` — usable standalone in CI/Make
- `druckform-mcp`: peers `druckform`, does not bundle engine internals
- Both: `"engines": { "node": ">=22" }`, npm provenance attestations on publish

### Docker tags
```
ghcr.io/<owner>/druckform:latest
ghcr.io/<owner>/druckform:1.2.3
ghcr.io/<owner>/druckform:1.2
```

### Filesystem contract (inside the image)
```
/app/templates/     bundled templates
/app/components/    bundled components
/app/styles/        bundled styles + schemas
/work/templates/    ← user mount (override/extend)
/work/components/   ← user mount (override/add)
/work/styles/       ← user mount
/work/jobs/<id>/    MCP-managed job dirs
```

---

## 6. Open Items (resolved defaults per spec)

- User component loading: `.ts` via in-container esbuild; `.js` fallback
- `curl` + `zip` assumed present in the agent's sandbox (not the container). Documented as a requirement.
- `druck mcp` starts both the MCP server and the localhost HTTP upload/download server as a single process.
