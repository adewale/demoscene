import type { CloudflareProduct } from "../lib/wrangler/parse";

type ProductIconStripProps = {
  products: CloudflareProduct[];
};

const ICONS: Record<string, string> = {
  ai: "AI",
  d1: "D1",
  "durable-objects": "DO",
  kv: "KV",
  pages: "PG",
  queues: "Q",
  r2: "R2",
  vectorize: "V",
  workers: "W",
  workflows: "WF",
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
          <span
            aria-label={product.label}
            className="product-pill"
            title={product.label}
          >
            <ProductGlyph product={product} />
            <span className="sr-only">{product.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
