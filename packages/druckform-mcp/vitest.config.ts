import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 80 },
      exclude: ["dist/**", "vitest.config.ts", "tsup.config.ts"],
    },
  },
});
