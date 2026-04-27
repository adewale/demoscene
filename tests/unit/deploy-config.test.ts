import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as {
  scripts: Record<string, string>;
};

describe("deployment scripts", () => {
  it("defines a remote D1 migration command", () => {
    expect(PACKAGE_JSON.scripts["db:migrate:remote"]).toBe(
      "wrangler d1 migrations apply DB --remote --config wrangler.jsonc",
    );
  });

  it("runs remote migrations before deployment", () => {
    const deployScript = PACKAGE_JSON.scripts.deploy ?? "";

    expect(deployScript).toContain("npm run db:migrate:remote");
    expect(deployScript).toContain("wrangler deploy --config wrangler.jsonc");
    expect(deployScript.indexOf("npm run db:migrate:remote")).toBeLessThan(
      deployScript.indexOf("wrangler deploy --config wrangler.jsonc"),
    );
  });
});
