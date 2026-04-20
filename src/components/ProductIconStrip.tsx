import type { CloudflareProduct } from "../lib/wrangler/parse";

import { CloudflareProductChip } from "./CloudflareProductChip";

type ProductIconStripProps = {
  products: CloudflareProduct[];
};

export function ProductIconStrip({ products }: ProductIconStripProps) {
  return (
    <ul aria-label="Cloudflare products" className="product-strip">
      {products.map((product) => (
        <li key={product.key}>
          <CloudflareProductChip product={product} />
        </li>
      ))}
    </ul>
  );
}
