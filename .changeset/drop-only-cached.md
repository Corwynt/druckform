---
"druckform": patch
---

Render with Tectonic's network access enabled (drop `--only-cached`). Missing LaTeX packages and fonts now download on demand instead of failing when absent from the cache, so a local install no longer needs a pre-warmed cache before the first render. `--untrusted` (shell-escape hardening) is unchanged. For offline/hermetic rendering, pre-warm the cache and run Tectonic with `--only-cached` externally.
