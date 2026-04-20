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
      browser: { binding: "BROWSER", type: "browser" },
      containers: [{ class_name: "MyContainer", image: "./Dockerfile" }],
      hyperdrive: [{ binding: "HYPERDRIVE" }],
      images: { binding: "IMAGES" },
      send_email: [{ name: "EMAIL" }],
      analytics_engine_datasets: [{ binding: "ANALYTICS" }],
      dispatch_namespaces: [{ binding: "DISPATCHER" }],
      secrets_store_secrets: [{ binding: "SECRET_STORE" }],
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
      "browser-run",
      "containers",
      "hyperdrive",
      "images",
      "email",
      "analytics-engine",
      "workers-for-platforms",
      "secret-store",
    ]);
  });

  it("infers package-signaled products from exact Cloudflare dependencies and Pages scripts", () => {
    const products = inferCloudflareProducts(
      {},
      parsePackageManifest(`{
        "scripts": {
          "deploy": "npm run build && wrangler pages deploy dist"
        },
        "dependencies": {
          "@cloudflare/ai-gateway": "1.0.0",
          "@cloudflare/ai-chat": "1.0.0",
          "@cloudflare/containers": "1.0.0",
          "@cloudflare/playwright": "1.0.0",
          "@cloudflare/realtimekit-react": "1.0.0",
          "@cloudflare/sandbox": "1.0.0",
          "@cloudflare/stream-react": "1.0.0",
          "@cloudflare/voice": "1.0.0",
          "agents": "1.0.0"
        }
      }`),
    );

    expect(products.map((product) => product.key)).toEqual([
      "workers",
      "pages",
      "ai",
      "ai-gateway",
      "browser-run",
      "containers",
      "realtime",
      "stream",
      "voice",
      "sandboxes",
      "agents",
    ]);
  });

  it("infers Agents from the corpus when the agents package is present", () => {
    const products = inferCloudflareProducts(
      {},
      parsePackageManifest(AGENTS_STARTER_PACKAGE),
    );

    expect(products.map((product) => product.key)).toEqual([
      "workers",
      "ai",
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

  it("property: explicit wrangler product keys always map to the intended product", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ["browser-run", { browser: { binding: "BROWSER", type: "browser" } }],
          [
            "containers",
            {
              containers: [{ class_name: "Container", image: "./Dockerfile" }],
            },
          ],
          ["hyperdrive", { hyperdrive: [{ binding: "HYPERDRIVE" }] }],
          ["images", { images: { binding: "IMAGES" } }],
          ["email", { send_email: [{ name: "EMAIL" }] }],
          [
            "analytics-engine",
            { analytics_engine_datasets: [{ binding: "ANALYTICS" }] },
          ],
          [
            "workers-for-platforms",
            { dispatch_namespaces: [{ binding: "DISPATCHER" }] },
          ],
          [
            "secret-store",
            { secrets_store_secrets: [{ binding: "SECRET_STORE" }] },
          ],
        ),
        ([productKey, config]) => {
          const products = inferCloudflareProducts(config);

          expect(products.some((product) => product.key === productKey)).toBe(
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

  it("property: exact Cloudflare package signals map to the intended product", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ),
        fc.constantFrom(
          ["ai", "@cloudflare/ai-chat"],
          ["ai-gateway", "@cloudflare/ai-gateway"],
          ["browser-run", "@cloudflare/puppeteer"],
          ["containers", "@cloudflare/containers"],
          ["realtime", "@cloudflare/realtimekit-react"],
          ["stream", "@cloudflare/stream-react"],
          ["voice", "@cloudflare/voice"],
        ),
        (section, [productKey, dependencyName]) => {
          const products = inferCloudflareProducts(
            {},
            {
              [section]: { [dependencyName]: "1.0.0" },
            },
          );

          expect(products.some((product) => product.key === productKey)).toBe(
            true,
          );
        },
      ),
    );
  });

  it("property: Pages package heuristics detect wrangler pages scripts", () => {
    fc.assert(
      fc.property(fc.string(), (prefix) => {
        const products = inferCloudflareProducts(
          {},
          {
            scripts: { deploy: `${prefix} wrangler pages deploy dist` },
          },
        );

        expect(products.some((product) => product.key === "pages")).toBe(true);
      }),
    );
  });

  it("sorts products into UI order", () => {
    expect(
      sortCloudflareProducts([
        { key: "browser-run", label: "Browser Run" },
        { key: "agents", label: "Agents" },
        { key: "d1", label: "D1" },
        { key: "containers", label: "Containers" },
        { key: "sandboxes", label: "Sandboxes" },
        { key: "workers", label: "Workers" },
        { key: "pages", label: "Pages" },
      ]),
    ).toEqual([
      { key: "workers", label: "Workers" },
      { key: "pages", label: "Pages" },
      { key: "d1", label: "D1" },
      { key: "browser-run", label: "Browser Run" },
      { key: "containers", label: "Containers" },
      { key: "sandboxes", label: "Sandboxes" },
      { key: "agents", label: "Agents" },
    ]);
  });
});
