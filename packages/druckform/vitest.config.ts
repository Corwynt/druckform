import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 80 },
      exclude: [
        "src/diagram/**",
        "src/latex/tectonic.ts",
        "dist/**",
        "vitest.config.ts",
        "tsup.config.ts",
        // Test fixtures and support code.
        "tests/**",
        // Bundled template components are loaded via an esbuild temp-file, so v8
        // can't attribute coverage to their source — their behavior is covered by
        // the block-component / tokens-to-latex / document-component tests instead.
        "templates/**",
      ],
    },
  },
});
