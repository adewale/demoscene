import type { CloudflareProduct } from "../lib/wrangler/parse";

type ProductIconStripProps = {
  products: CloudflareProduct[];
};

type ProductInfo = {
  description: string;
  href: string;
};

const ICONS: Record<string, string> = {
  agents: "AG",
  ai: "AI",
  "ai-gateway": "GW",
  "analytics-engine": "AE",
  "browser-run": "BR",
  containers: "CT",
  d1: "D1",
  "durable-objects": "DO",
  email: "EM",
  hyperdrive: "HD",
  images: "IM",
  kv: "KV",
  pages: "PG",
  queues: "Q",
  r2: "R2",
  realtime: "RT",
  sandboxes: "SB",
  "secret-store": "SS",
  stream: "ST",
  vectorize: "V",
  voice: "VC",
  workers: "W",
  "workers-for-platforms": "W4P",
  workflows: "WF",
};

const PRODUCT_INFO: Record<string, ProductInfo> = {
  agents: {
    description: "Build stateful AI agents on Cloudflare with the Agents SDK.",
    href: "https://developers.cloudflare.com/agents/",
  },
  ai: {
    description: "Run AI models close to users with Workers AI.",
    href: "https://developers.cloudflare.com/workers-ai/",
  },
  "ai-gateway": {
    description: "Observe, cache, and control AI traffic with AI Gateway.",
    href: "https://developers.cloudflare.com/ai-gateway/",
  },
  "analytics-engine": {
    description: "Query analytics datasets from Workers with Analytics Engine.",
    href: "https://developers.cloudflare.com/analytics/analytics-engine/",
  },
  "browser-run": {
    description: "Automate headless browsers on Cloudflare with Browser Run.",
    href: "https://developers.cloudflare.com/browser-run/",
  },
  containers: {
    description: "Run serverless containers alongside Workers on Cloudflare.",
    href: "https://developers.cloudflare.com/containers/",
  },
  d1: {
    description: "Use Cloudflare's serverless SQL database at the edge.",
    href: "https://developers.cloudflare.com/d1/",
  },
  "durable-objects": {
    description: "Keep strongly consistent state close to your Worker logic.",
    href: "https://developers.cloudflare.com/durable-objects/",
  },
  email: {
    description: "Send and receive email from Workers with Email Workers.",
    href: "https://developers.cloudflare.com/email-routing/email-workers/",
  },
  hyperdrive: {
    description: "Connect Workers to external databases with Hyperdrive.",
    href: "https://developers.cloudflare.com/hyperdrive/",
  },
  images: {
    description:
      "Transform, optimize, and deliver images with Cloudflare Images.",
    href: "https://developers.cloudflare.com/images/",
  },
  kv: {
    description: "Serve globally distributed key-value data with low latency.",
    href: "https://developers.cloudflare.com/kv/",
  },
  pages: {
    description: "Deploy full-stack apps and static sites on Cloudflare Pages.",
    href: "https://developers.cloudflare.com/pages/",
  },
  queues: {
    description: "Move async work through managed message queues.",
    href: "https://developers.cloudflare.com/queues/",
  },
  r2: {
    description: "Store and serve objects with zero egress fees.",
    href: "https://developers.cloudflare.com/r2/",
  },
  realtime: {
    description:
      "Build real-time video and voice experiences with Cloudflare Realtime.",
    href: "https://developers.cloudflare.com/realtime/",
  },
  sandboxes: {
    description:
      "Run untrusted code in isolated environments with the Sandbox SDK.",
    href: "https://developers.cloudflare.com/sandbox/",
  },
  "secret-store": {
    description: "Store reusable account-level secrets with Secrets Store.",
    href: "https://developers.cloudflare.com/secrets-store/",
  },
  stream: {
    description:
      "Upload, encode, and deliver live and on-demand video with Stream.",
    href: "https://developers.cloudflare.com/stream/",
  },
  vectorize: {
    description: "Search vector embeddings with Cloudflare Vectorize.",
    href: "https://developers.cloudflare.com/vectorize/",
  },
  voice: {
    description:
      "Add programmable voice experiences with Cloudflare's realtime stack.",
    href: "https://developers.cloudflare.com/realtime/",
  },
  workers: {
    description: "Deploy serverless code globally on the Cloudflare edge.",
    href: "https://developers.cloudflare.com/workers/",
  },
  "workers-for-platforms": {
    description:
      "Build multi-tenant Worker platforms with dispatch namespaces and Workers for Platforms.",
    href: "https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/",
  },
  workflows: {
    description: "Orchestrate durable multi-step jobs with Workflows.",
    href: "https://developers.cloudflare.com/workflows/",
  },
};

function ProductGlyph({ product }: { product: CloudflareProduct }) {
  const symbol = ICONS[product.key];

  if (!symbol) {
    return <span className="product-fallback-text">{product.label}</span>;
  }

  return (
    <svg aria-hidden="true" className="product-icon" viewBox="0 0 48 48">
      <rect x="4" y="4" width="40" height="40" rx="14" />
      <text x="24" y="29" textAnchor="middle">
        {symbol}
      </text>
    </svg>
  );
}

export function ProductIconStrip({ products }: ProductIconStripProps) {
  return (
    <ul aria-label="Cloudflare products" className="product-strip">
      {products.map((product) => (
        <li key={product.key}>
          <a
            aria-label={product.label}
            className="product-pill product-link"
            href={
              PRODUCT_INFO[product.key]?.href ??
              "https://developers.cloudflare.com/"
            }
            rel="noreferrer"
            target="_blank"
          >
            <ProductGlyph product={product} />
            <span className="sr-only">{product.label}</span>
            <span className="product-tooltip" role="tooltip">
              <strong>{product.label}</strong>
              <span>
                {PRODUCT_INFO[product.key]?.description ?? product.label}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
