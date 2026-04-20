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
  d1: "D1",
  "durable-objects": "DO",
  kv: "KV",
  pages: "PG",
  queues: "Q",
  r2: "R2",
  sandboxes: "SB",
  vectorize: "V",
  workers: "W",
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
  d1: {
    description: "Use Cloudflare's serverless SQL database at the edge.",
    href: "https://developers.cloudflare.com/d1/",
  },
  "durable-objects": {
    description: "Keep strongly consistent state close to your Worker logic.",
    href: "https://developers.cloudflare.com/durable-objects/",
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
  sandboxes: {
    description:
      "Run untrusted code in isolated environments with the Sandbox SDK.",
    href: "https://developers.cloudflare.com/sandbox/",
  },
  vectorize: {
    description: "Search vector embeddings with Cloudflare Vectorize.",
    href: "https://developers.cloudflare.com/vectorize/",
  },
  workers: {
    description: "Deploy serverless code globally on the Cloudflare edge.",
    href: "https://developers.cloudflare.com/workers/",
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
