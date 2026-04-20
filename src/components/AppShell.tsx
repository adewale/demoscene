import type { PropsWithChildren } from "react";

const styles = `
  :root {
    color-scheme: light;
    --bg: #f5f1eb;
    --surface: #fffbf5;
    --surface-strong: #fffdfb;
    --surface-hover: #fef7ed;
    --border: #ebd5c1;
    --text: #521000;
    --muted: rgba(82, 16, 0, 0.7);
    --subtle: rgba(82, 16, 0, 0.45);
    --accent: #ff4801;
    --accent-hover: #ff7038;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background:
      linear-gradient(180deg, rgba(255, 72, 1, 0.05), rgba(255, 255, 255, 0) 18%),
      var(--bg);
    color: var(--text);
  }

  a {
    color: inherit;
  }

  .shell {
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }

  .site-header {
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--border);
  }

  .site-header h1 {
    margin: 0;
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    line-height: 1;
    font-weight: 500;
    letter-spacing: -0.02em;
  }

  .site-title-link {
    text-decoration: none;
  }

  .site-title-link:hover,
  .site-title-link:focus-visible {
    color: var(--accent);
  }

  .site-header p {
    margin: 8px 0 0;
    max-width: 64ch;
    color: var(--muted);
    font-size: 0.98rem;
  }

  .feed-shell {
    display: grid;
    gap: 20px;
  }

  .feed-list {
    display: grid;
    gap: 14px;
  }

  .feed-entry {
    display: grid;
    gap: 10px;
  }

  .feed-day-marker {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--subtle);
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .feed-day-marker::before,
  .feed-day-marker::after {
    content: "";
    flex: 1 1 auto;
    min-width: 24px;
    height: 1px;
    background-image: linear-gradient(to right, var(--border) 50%, transparent 50%);
    background-size: 16px 1px;
    background-repeat: repeat-x;
  }

  .feed-day-marker span {
    white-space: nowrap;
  }

  .feed-pager {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
  }

  .feed-pager .link-button:last-child {
    justify-self: end;
  }

  .pager-label {
    color: var(--muted);
    font-size: 0.84rem;
    text-align: center;
  }

  .pager-spacer {
    display: block;
    min-height: 1px;
  }

  .card,
  .detail {
    position: relative;
    overflow: visible;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--surface-strong);
    box-shadow: 0 1px 3px rgba(82, 16, 0, 0.04), 0 4px 12px rgba(82, 16, 0, 0.02);
  }

  .card-corner {
    position: absolute;
    width: 8px;
    height: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    pointer-events: none;
    z-index: 2;
  }

  .card-corner-tl { top: -5px; left: -5px; }
  .card-corner-tr { top: -5px; right: -5px; }
  .card-corner-bl { bottom: -5px; left: -5px; }
  .card-corner-br { bottom: -5px; right: -5px; }

  .card-body,
  .detail-body {
    position: relative;
    padding: 18px;
  }

  .project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 0;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .project-title {
    margin: 0;
    font-size: 1.15rem;
  }

  .product-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .product-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }

  .product-link {
    position: relative;
    text-decoration: none;
  }

  .product-link:hover,
  .product-link:focus-visible {
    border-color: var(--text);
    background: var(--surface-hover);
  }

  .product-tooltip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    width: 220px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-strong);
    box-shadow: 0 4px 12px rgba(82, 16, 0, 0.08);
    color: var(--text);
    display: grid;
    gap: 4px;
    opacity: 0;
    pointer-events: none;
    transform: translateX(-50%) translateY(4px);
    transition: opacity 150ms ease, transform 150ms ease;
    z-index: 2;
  }

  .product-link:hover .product-tooltip,
  .product-link:focus-visible .product-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .product-tooltip strong {
    font-size: 0.78rem;
    font-weight: 700;
  }

  .product-tooltip span {
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--muted);
  }

  .product-icon {
    width: 20px;
    height: 20px;
    fill: rgba(82, 16, 0, 0.06);
    stroke: rgba(82, 16, 0, 0.3);
    stroke-width: 1.4;
  }

  .product-icon text {
    fill: var(--text);
    stroke: none;
    font-size: 9px;
    font-weight: 800;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.04em;
  }

  .product-fallback-text {
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1;
    text-align: center;
  }

  .markdown-preview,
  .markdown-document {
    color: var(--text);
    line-height: 1.6;
  }

  .feed-card .markdown-preview {
    color: var(--muted);
    font-size: 0.95rem;
    line-height: 1.55;
  }

  .markdown-preview > :first-child,
  .markdown-document > :first-child {
    margin-top: 0;
  }

  .markdown-preview h1,
  .markdown-preview h2,
  .markdown-document h1,
  .markdown-document h2,
  .markdown-document h3 {
    line-height: 1.2;
  }

  .markdown-preview p,
  .markdown-document p,
  .markdown-document ul {
    margin: 0 0 0.9rem;
  }

  .feed-card .markdown-preview p,
  .feed-card .markdown-preview ul {
    margin: 0 0 0.65rem;
  }

  .markdown-preview img,
  .markdown-document img,
  .preview-media img {
    width: 100%;
    border-radius: 16px;
  }

  .preview-media {
    margin: 0;
  }

  .preview-media img {
    display: block;
    border: 1px solid var(--border);
    object-fit: cover;
    aspect-ratio: 16 / 9;
    background: var(--surface-strong);
  }

  .preview-media-fallback {
    border: 1px dashed var(--border);
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(244,129,32,0.06));
  }

  .preview-fallback-art {
    display: grid;
    gap: 6px;
    place-items: center;
    padding: 24px 18px;
    min-height: 120px;
    aspect-ratio: 16 / 9;
    text-align: center;
    color: var(--muted);
  }

  .preview-fallback-art span {
    color: var(--text);
    font-weight: 700;
  }

  .preview-fallback-art small {
    font-size: 0.82rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .feed-card {
    border-radius: 0;
  }

  .feed-card-body {
    display: grid;
    gap: 14px;
  }

  .feed-card-topline {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px;
    align-items: start;
  }

  .feed-card-author {
    display: flex;
    gap: 10px;
    align-items: start;
    min-width: 0;
  }

  .feed-card-avatar {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.9);
    flex: 0 0 auto;
  }

  .feed-card-author-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .feed-card-kicker {
    margin: 0;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .feed-card-kicker strong {
    color: var(--text);
    font-weight: 700;
  }

  .feed-card-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: start;
  }

  .button-base {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-strong);
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
    transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease;
  }

  .button-base:hover,
  .button-base:focus-visible {
    border-style: dashed;
    border-color: var(--accent);
    color: var(--text);
    background: var(--surface-hover);
  }

  .button-primary {
    border-color: var(--accent);
    background: var(--accent);
    color: white;
  }

  .button-primary:hover,
  .button-primary:focus-visible {
    border-color: var(--accent);
    background: var(--accent-hover);
    color: white;
  }

  .button-secondary {
    background: var(--surface-strong);
    color: var(--text);
  }

  .button-ghost {
    background: transparent;
    color: var(--accent);
  }

  .feed-card-copy {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .feed-card-title {
    font-size: 1.04rem;
    line-height: 1.25;
    font-weight: 500;
  }

  .feed-title-link {
    text-decoration: none;
  }

  .feed-title-link:hover,
  .feed-title-link:focus-visible {
    color: var(--accent);
  }

  .feed-card-links .button-primary {
    min-width: 72px;
  }

  .empty-state {
    padding: 40px 24px;
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: 22px;
    color: var(--muted);
    background: rgba(255, 255, 255, 0.45);
  }

  .detail-layout {
    display: grid;
    gap: 24px;
  }

  .detail-sidebar {
    display: grid;
    gap: 14px;
  }

  @media (min-width: 960px) {
    .feed-card-links {
      justify-content: end;
    }

    .detail-layout {
      grid-template-columns: minmax(0, 2fr) minmax(260px, 320px);
      align-items: start;
    }

    .detail-sidebar {
      position: sticky;
      top: 24px;
    }
  }
`;

type AppShellProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function AppShell({ children, subtitle, title }: AppShellProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{styles}</style>
      </head>
      <body>
        <div className="shell">
          <header className="site-header">
            <h1>
              <a className="site-title-link" href="/">
                {title}
              </a>
            </h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
