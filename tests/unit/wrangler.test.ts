import { describe, expect, it } from "vitest";

import {
  inferCloudflareProducts,
  parseWranglerConfig,
  sortCloudflareProducts,
} from "../../src/lib/wrangler/parse";

describe("parseWranglerConfig", () => {
  it("parses TOML wrangler config", () => {
    const config = parseWranglerConfig(
      `name = "demo"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"

[[kv_namespaces]]
binding = "CACHE"
`,
      "wrangler.toml",
    );

    expect(config.pages_build_output_dir).toBe("dist");
    expect(config.d1_databases).toHaveLength(1);
  });

  it("parses JSONC wrangler config", () => {
    const config = parseWranglerConfig(
      `{
        // demo
        "r2_buckets": [{ "binding": "ASSETS" }],
        "queues": { "producers": [{ "binding": "JOBS" }] }
      }`,
      "wrangler.jsonc",
    );

    expect(config.r2_buckets).toHaveLength(1);
    expect((config.queues as { producers: unknown[] }).producers).toHaveLength(
      1,
    );
  });

  it("rejects unsupported Wrangler formats", () => {
    expect(() => parseWranglerConfig("name = demo", "wrangler.yaml")).toThrow(
      "Unsupported Wrangler config format",
    );
  });
});

describe("inferCloudflareProducts", () => {
  it("infers configured products from the top-level Wrangler config", () => {
    const products = inferCloudflareProducts({
      pages_build_output_dir: "dist",
      d1_databases: [{ binding: "DB" }],
      kv_namespaces: [{ binding: "CACHE" }],
      r2_buckets: [{ binding: "ASSETS" }],
      durable_objects: { bindings: [{ name: "STATE", class_name: "Counter" }] },
      queues: { producers: [{ binding: "JOBS" }] },
      workflows: [{ binding: "FLOW", name: "demo" }],
      vectorize: [{ binding: "INDEX" }],
      ai: { binding: "AI" },
    });

    expect(products.map((product) => product.key)).toEqual([
      "workers",
      "pages",
      "d1",
      "kv",
      "r2",
      "durable-objects",
      "queues",
      "workflows",
      "vectorize",
      "ai",
    ]);
  });

  it("defaults to Workers when a Wrangler file exists", () => {
    expect(inferCloudflareProducts({})).toEqual([
      { key: "workers", label: "Workers" },
    ]);
  });

  it("sorts products into UI order", () => {
    expect(
      sortCloudflareProducts([
        { key: "d1", label: "D1" },
        { key: "workers", label: "Workers" },
        { key: "pages", label: "Pages" },
      ]),
    ).toEqual([
      { key: "workers", label: "Workers" },
      { key: "pages", label: "Pages" },
      { key: "d1", label: "D1" },
    ]);
  });
});
