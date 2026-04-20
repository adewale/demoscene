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
const AI_GATEWAY_PACKAGE_NAMES = ["@cloudflare/ai-gateway"] as const;
const AI_PACKAGE_NAMES = [
  "@cloudflare/ai",
  "@cloudflare/ai-chat",
  "@cloudflare/ai-utils",
  "workers-ai-provider",
] as const;
const BROWSER_RUN_PACKAGE_NAMES = [
  "@cloudflare/playwright",
  "@cloudflare/playwright-mcp",
  "@cloudflare/puppeteer",
] as const;
const CONTAINER_PACKAGE_NAMES = ["@cloudflare/containers"] as const;
const PAGE_PACKAGE_NAMES = [
  "@cloudflare/next-on-pages",
  "@cloudflare/pages-plugin-cloudflare-access",
] as const;
const REALTIME_PACKAGE_PREFIXES = ["@cloudflare/realtimekit"] as const;
const SANDBOX_PACKAGE_NAMES = ["@cloudflare/sandbox"] as const;
const SANDBOX_PACKAGE_COMBINATIONS = [
  ["@cloudflare/shell", "@cloudflare/think"],
] as const;
const STREAM_PACKAGE_NAMES = ["@cloudflare/stream-react"] as const;
const VOICE_PACKAGE_NAMES = ["@cloudflare/voice"] as const;

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
  "ai-gateway": "AI Gateway",
  "browser-run": "Browser Run",
  containers: "Containers",
  hyperdrive: "Hyperdrive",
  images: "Images",
  email: "Email",
  "analytics-engine": "Analytics Engine",
  "workers-for-platforms": "Workers for Platforms",
  "secret-store": "Secret Store",
  realtime: "Realtime",
  stream: "Stream",
  voice: "Voice",
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

function hasDependencyPrefix(
  manifest: PackageManifest | undefined,
  prefixes: readonly string[],
): boolean {
  const names = dependencyNames(manifest);
  return [...names].some((name) =>
    prefixes.some((prefix) => name.startsWith(prefix)),
  );
}

function hasPagesScript(manifest: PackageManifest | undefined): boolean {
  if (!manifest || !isRecord(manifest.scripts)) {
    return false;
  }

  return Object.values(manifest.scripts).some(
    (command) =>
      typeof command === "string" && /\bwrangler\s+pages\b/i.test(command),
  );
}

export function inferCloudflareProducts(
  config: WranglerConfig,
  packageManifest?: PackageManifest,
): CloudflareProduct[] {
  const products: CloudflareProduct[] = [];

  addProduct(products, "workers");

  if (
    config.pages_build_output_dir ||
    hasAnyDependency(packageManifest, PAGE_PACKAGE_NAMES) ||
    hasPagesScript(packageManifest)
  ) {
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

  if (
    hasEntries(config.ai) ||
    hasAnyDependency(packageManifest, AI_PACKAGE_NAMES)
  ) {
    addProduct(products, "ai");
  }

  if (hasAnyDependency(packageManifest, AI_GATEWAY_PACKAGE_NAMES)) {
    addProduct(products, "ai-gateway");
  }

  if (
    hasEntries(config.browser) ||
    hasAnyDependency(packageManifest, BROWSER_RUN_PACKAGE_NAMES)
  ) {
    addProduct(products, "browser-run");
  }

  if (
    hasEntries(config.containers) ||
    hasAnyDependency(packageManifest, CONTAINER_PACKAGE_NAMES)
  ) {
    addProduct(products, "containers");
  }

  if (hasEntries(config.hyperdrive)) {
    addProduct(products, "hyperdrive");
  }

  if (hasEntries(config.images)) {
    addProduct(products, "images");
  }

  if (hasEntries(config.send_email)) {
    addProduct(products, "email");
  }

  if (hasEntries(config.analytics_engine_datasets)) {
    addProduct(products, "analytics-engine");
  }

  if (hasEntries(config.dispatch_namespaces)) {
    addProduct(products, "workers-for-platforms");
  }

  if (hasEntries(config.secrets_store_secrets)) {
    addProduct(products, "secret-store");
  }

  if (hasDependencyPrefix(packageManifest, REALTIME_PACKAGE_PREFIXES)) {
    addProduct(products, "realtime");
  }

  if (hasAnyDependency(packageManifest, STREAM_PACKAGE_NAMES)) {
    addProduct(products, "stream");
  }

  if (hasAnyDependency(packageManifest, VOICE_PACKAGE_NAMES)) {
    addProduct(products, "voice");
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
