import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

type WranglerConfig = Record<string, unknown>;
type PackageManifest = Record<string, unknown>;

const PACKAGE_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const AGENT_PACKAGE_NAMES = [
  "agents",
  "hono-agents",
  "@cloudflare/agents",
] as const;
const SANDBOX_PACKAGE_NAMES = ["@cloudflare/sandbox"] as const;
const SANDBOX_PACKAGE_COMBINATIONS = [
  ["@cloudflare/shell", "@cloudflare/think"],
] as const;

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
  sandboxes: "Sandboxes",
  agents: "Agents",
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

export function parsePackageManifest(contents: string): PackageManifest {
  const parsed = JSON.parse(contents) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Package manifest must be a JSON object");
  }

  return parsed;
}

function dependencyNames(manifest: PackageManifest | undefined): Set<string> {
  const names = new Set<string>();

  if (!manifest) {
    return names;
  }

  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const section = manifest[field];

    if (!isRecord(section)) {
      continue;
    }

    for (const dependencyName of Object.keys(section)) {
      names.add(dependencyName);
    }
  }

  return names;
}

function hasAnyDependency(
  manifest: PackageManifest | undefined,
  packageNames: readonly string[],
): boolean {
  const names = dependencyNames(manifest);
  return packageNames.some((packageName) => names.has(packageName));
}

function hasAllDependencies(
  manifest: PackageManifest | undefined,
  packageNames: readonly string[],
): boolean {
  const names = dependencyNames(manifest);
  return packageNames.every((packageName) => names.has(packageName));
}

export function inferCloudflareProducts(
  config: WranglerConfig,
  packageManifest?: PackageManifest,
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

  if (
    hasAnyDependency(packageManifest, SANDBOX_PACKAGE_NAMES) ||
    SANDBOX_PACKAGE_COMBINATIONS.some((packageNames) =>
      hasAllDependencies(packageManifest, packageNames),
    )
  ) {
    addProduct(products, "sandboxes");
  }

  if (hasAnyDependency(packageManifest, AGENT_PACKAGE_NAMES)) {
    addProduct(products, "agents");
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
