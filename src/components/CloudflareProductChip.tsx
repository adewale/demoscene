import type { CSSProperties } from "react";

import {
  AppWindow,
  Archive,
  AudioLines,
  Bot,
  Boxes,
  Brain,
  ChartColumn,
  Cpu,
  Database,
  FileText,
  Image,
  type LucideIcon,
  Key,
  ListOrdered,
  Lock,
  Mail,
  Monitor,
  Network,
  Play,
  Radar,
  Radio,
  Rocket,
  SquareDashed,
  Vault,
  Workflow,
} from "lucide-react";

import {
  CLOUDFLARE_PRODUCT_BY_KEY,
  type CloudflareProductKey,
} from "../lib/cloudflare-products";
import type { CloudflareProduct } from "../lib/wrangler/parse";

type CloudflareProductChipProps = {
  product: CloudflareProduct;
};

export const PRODUCT_ICONS: Record<
  (typeof CLOUDFLARE_PRODUCT_BY_KEY)[CloudflareProductKey]["icon"],
  LucideIcon
> = {
  AppWindow,
  Archive,
  AudioLines,
  Bot,
  Boxes,
  Brain,
  ChartColumn,
  Cpu,
  Database,
  FileText,
  Image,
  Key,
  ListOrdered,
  Lock,
  Mail,
  Monitor,
  Network,
  Play,
  Radar,
  Radio,
  Rocket,
  SquareDashed,
  Vault,
  Workflow,
};

export function CloudflareProductChip({ product }: CloudflareProductChipProps) {
  const config = CLOUDFLARE_PRODUCT_BY_KEY[product.key];
  const Icon = PRODUCT_ICONS[config.icon];

  return (
    <a
      aria-label={config.label}
      className="product-chip product-link"
      href={config.href}
      rel="noreferrer"
      style={{ "--product-rgb": config.tone } as CSSProperties}
      target="_blank"
    >
      <span aria-hidden="true" className="product-chip-icon-wrap">
        <Icon className="product-chip-icon" strokeWidth={1.8} />
      </span>
      <span className="product-chip-label">{config.shortLabel}</span>
      <span className="sr-only">{config.label}</span>
      <span className="product-tooltip" role="tooltip">
        <strong>{config.label}</strong>
        <span>{config.description}</span>
      </span>
    </a>
  );
}
