import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["tests/setup/component.setup.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
