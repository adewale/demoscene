import type { CloudflareProduct } from "../lib/wrangler/parse";

type ProductIconStripProps = {
  products: CloudflareProduct[];
};

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
            {product.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
