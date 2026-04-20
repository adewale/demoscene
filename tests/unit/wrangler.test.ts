import fc from "fast-check";
import { describe, expect, it } from "vitest";

import AGENTS_STARTER_PACKAGE from "../../corpus-cache/projects/fayazara/agents-starter/package.json?raw";
import BOOKWORM_PACKAGE from "../../corpus-cache/projects/craigsdennis/bookworm-think-agent/package.json?raw";
import BOOKWORM_WRANGLER from "../../corpus-cache/projects/craigsdennis/bookworm-think-agent/wrangler.jsonc?raw";
import SANDBOX_PLAYGROUND_PACKAGE from "../../corpus-cache/projects/harshil1712/sandbox-playground/package.json?raw";

import {
  inferCloudflareProducts,
  parsePackageManifest,
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

  it("infers Agents from the corpus when the agents package is present", () => {
    const products = inferCloudflareProducts(
      {},
      parsePackageManifest(AGENTS_STARTER_PACKAGE),
    );

    expect(products.map((product) => product.key)).toEqual([
      "workers",
      "agents",
    ]);
  });

  it("infers Sandboxes from the corpus when the sandbox sdk package is present", () => {
    const products = inferCloudflareProducts(
      {},
      parsePackageManifest(SANDBOX_PLAYGROUND_PACKAGE),
    );

    expect(products.map((product) => product.key)).toEqual([
      "workers",
      "sandboxes",
    ]);
  });

  it("infers both Sandboxes and Agents for the bookworm corpus example", () => {
    const products = inferCloudflareProducts(
      parseWranglerConfig(BOOKWORM_WRANGLER, "wrangler.jsonc"),
      parsePackageManifest(BOOKWORM_PACKAGE),
    );

    expect(products.map((product) => product.key)).toEqual([
      "workers",
      "r2",
      "durable-objects",
      "ai",
      "sandboxes",
      "agents",
    ]);
  });

  it("defaults to Workers when a Wrangler file exists", () => {
    expect(inferCloudflareProducts({})).toEqual([
      { key: "workers", label: "Workers" },
    ]);
  });

  it("property: exact agent dependencies are detected in any dependency section", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ),
        fc.constantFrom("agents", "hono-agents", "@cloudflare/agents"),
        (section, dependencyName) => {
          const products = inferCloudflareProducts(
            {},
            {
              [section]: { [dependencyName]: "1.0.0" },
            },
          );

          expect(products.some((product) => product.key === "agents")).toBe(
            true,
          );
        },
      ),
    );
  });

  it("property: sandbox heuristics match exact package signals and ignore lookalikes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ),
        fc
          .string()
          .filter(
            (value) =>
              ![
                "@cloudflare/sandbox",
                "@cloudflare/shell",
                "@cloudflare/think",
              ].includes(value),
          ),
        (section, lookalikeDependency) => {
          const products = inferCloudflareProducts(
            {},
            {
              [section]: { [lookalikeDependency]: "1.0.0" },
            },
          );

          expect(products.some((product) => product.key === "sandboxes")).toBe(
            false,
          );
        },
      ),
    );
  });

  it("property: sandboxes are inferred from either sandbox sdk or shell plus think", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ),
        fc.constantFrom<"sandbox" | "shell-think">("sandbox", "shell-think"),
        (section, mode) => {
          const sectionValue =
            mode === "sandbox"
              ? { "@cloudflare/sandbox": "1.0.0" }
              : {
                  "@cloudflare/shell": "1.0.0",
                  "@cloudflare/think": "1.0.0",
                };
          const products = inferCloudflareProducts(
            {},
            {
              [section]: sectionValue,
            },
          );

          expect(products.some((product) => product.key === "sandboxes")).toBe(
            true,
          );
        },
      ),
    );
  });

  it("sorts products into UI order", () => {
    expect(
      sortCloudflareProducts([
        { key: "agents", label: "Agents" },
        { key: "d1", label: "D1" },
        { key: "sandboxes", label: "Sandboxes" },
        { key: "workers", label: "Workers" },
        { key: "pages", label: "Pages" },
      ]),
    ).toEqual([
      { key: "workers", label: "Workers" },
      { key: "pages", label: "Pages" },
      { key: "d1", label: "D1" },
      { key: "sandboxes", label: "Sandboxes" },
      { key: "agents", label: "Agents" },
    ]);
  });
});
