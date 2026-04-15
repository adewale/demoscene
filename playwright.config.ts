import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8788",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "npm run e2e:prepare && npx wrangler dev --local --ip 127.0.0.1 --port 8788 --config wrangler.jsonc",
    url: "http://127.0.0.1:8788",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
    {
      name: "mobile",
      use: devices["iPhone 13"],
    },
  ],
});
