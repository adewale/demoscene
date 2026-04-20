import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

const WRANGLER_CONFIG = readFileSync(
  resolve(process.cwd(), "wrangler.jsonc"),
  "utf8",
);

describe("wrangler.jsonc", () => {
  it("uses a separate preview D1 database", () => {
    const config = parse(WRANGLER_CONFIG) as {
      d1_databases: Array<{
        database_id: string;
        preview_database_id?: string;
      }>;
    };

    expect(config.d1_databases[0]?.database_id).not.toBe(
      config.d1_databases[0]?.preview_database_id,
    );
  });
});
