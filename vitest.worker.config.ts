import { fileURLToPath } from "node:url";

import {
  cloudflarePool,
  cloudflareTest,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const workersOptions = {
  main: "./src/index.tsx",
  wrangler: {
    configPath: "./wrangler.jsonc",
  },
};

export default defineConfig({
  plugins: [cloudflareTest(workersOptions)],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/worker.setup.ts"],
    pool: cloudflarePool(workersOptions),
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
    },
  },
});
