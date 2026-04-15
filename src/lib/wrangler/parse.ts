import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

type WranglerConfig = Record<string, unknown>;

export type CloudflareProduct = {
  key: string;
  label: string;
};

const PRODUCT_LABELS: Record<string, string> = {
  workers: "Workers",
  pages: "Pages",
  d1: "D1",
  kv: "KV",
  r2: "R2",
  "durable-objects": "Durable Objects",
  queues: "Queues",
  workflows: "Workflows",
  vectorize: "Vectorize",
  ai: "AI",
};

const PRODUCT_ORDER = Object.keys(PRODUCT_LABELS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasEntries(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.values(value).some((entry) => hasEntries(entry));
  }

  return Boolean(value);
}

function addProduct(
  products: CloudflareProduct[],
  key: keyof typeof PRODUCT_LABELS,
): void {
  if (!products.some((product) => product.key === key)) {
    products.push({ key, label: PRODUCT_LABELS[key] });
  }
}

export function parseWranglerConfig(
  contents: string,
  fileName: string,
): WranglerConfig {
  if (fileName.endsWith(".toml")) {
    return parseToml(contents) as WranglerConfig;
  }

  if (fileName.endsWith(".json") || fileName.endsWith(".jsonc")) {
    return parseJsonc(contents) as WranglerConfig;
  }

  throw new Error(`Unsupported Wrangler config format: ${fileName}`);
}

export function inferCloudflareProducts(
  config: WranglerConfig,
): CloudflareProduct[] {
  const products: CloudflareProduct[] = [];

  addProduct(products, "workers");

  if (config.pages_build_output_dir) {
    addProduct(products, "pages");
  }

  if (hasEntries(config.d1_databases)) {
    addProduct(products, "d1");
  }

  if (hasEntries(config.kv_namespaces)) {
    addProduct(products, "kv");
  }

  if (hasEntries(config.r2_buckets)) {
    addProduct(products, "r2");
  }

  if (
    isRecord(config.durable_objects) &&
    hasEntries(config.durable_objects.bindings)
  ) {
    addProduct(products, "durable-objects");
  }

  if (
    isRecord(config.queues) &&
    (hasEntries(config.queues.producers) || hasEntries(config.queues.consumers))
  ) {
    addProduct(products, "queues");
  }

  if (hasEntries(config.workflows)) {
    addProduct(products, "workflows");
  }

  if (hasEntries(config.vectorize)) {
    addProduct(products, "vectorize");
  }

  if (hasEntries(config.ai)) {
    addProduct(products, "ai");
  }

  return products;
}

export function sortCloudflareProducts(
  products: CloudflareProduct[],
): CloudflareProduct[] {
  return [...products].sort(
    (left, right) =>
      PRODUCT_ORDER.indexOf(left.key) - PRODUCT_ORDER.indexOf(right.key),
  );
}
