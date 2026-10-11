import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["tests/setup/component.setup.ts"],
    coverage: {
      // Measure every source file, not just the ones unit tests happen to
      // import. Without `include`, unloaded entrypoints (index, app, sync,
      // db, queue) are missing from the denominator and committed fixtures
      // (corpus-cache JSON, GitHub HTML) are counted as if they were code.
      include: ["src/**"],
      reporter: ["text", "lcov"],
      // Floors are the measured unit-suite numbers over all of src/ (see the
      // comment above). The old 90/85 floors were measured over 27 imported
      // files plus fixtures; the same tests over all of src/ measure
      // 44.6% lines. The worker suite (vitest.worker.config.ts) carries the
      // entrypoints and has its own floors. Raise these as coverage improves.
      thresholds: {
        lines: 44,
        functions: 48,
        statements: 44,
        branches: 40,
      },
    },
  },
});
