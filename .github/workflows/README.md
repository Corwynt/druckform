# GitHub Actions — Required Secrets

| Secret | Used by | How to obtain |
|---|---|---|
| `NPM_TOKEN` | release.yml | npm **automation** token with publish access to the `@druckform` org — npmjs.com → Access Tokens → Generate → Automation. Exposed to `changeset publish` as `NODE_AUTH_TOKEN`. |
| `TURBO_TOKEN` | ci.yml, release.yml | Turborepo remote cache — create at [turbo.build](https://turbo.build/repo/docs/core-concepts/remote-caching) or leave unset to skip caching |
| `TURBO_TEAM` | ci.yml, release.yml | Your Turborepo team slug (omit if using personal token) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions for GHCR access and Changesets PR operations — no manual setup needed. It must have **read/write** workflow permissions: repo (or org) → Settings → Actions → General → Workflow permissions → "Read and write permissions".

## Pre-publish checklist

Both packages are scoped and public (`publishConfig.access: public` + `.changeset/config.json` `"access": "public"`). Before the first release, verify the names are free and your token can publish to the `@druckform` org:

```bash
npm view @druckform/core   # want E404 before first publish
npm view @druckform/mcp    # want E404 before first publish
npm org ls druckform       # confirms you own/belong to the npm org
```

## GHCR visibility

The image `ghcr.io/druckform/druckform` is created **private** on its first push. After the first release run, make it public and link it to the repo:

GitHub → org **druckform** → Packages → **druckform** → Package settings →
- **Change visibility → Public** (so `docker run ghcr.io/druckform/druckform:latest` works for plugin users)
- **Manage Actions access** → add repo `druckform/druckform` with **Write** (lets `release.yml` push future tags via `GITHUB_TOKEN`)
