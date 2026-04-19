import type { PropsWithChildren } from "react";

const styles = `
  :root {
    color-scheme: light;
    --bg: #f7f1e8;
    --surface: rgba(255, 255, 255, 0.78);
    --surface-strong: #fffaf3;
    --border: rgba(43, 31, 24, 0.16);
    --text: #2b1f18;
    --muted: #6c5a4c;
    --accent: #f48120;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background:
      radial-gradient(circle at top left, rgba(244, 129, 32, 0.12), transparent 32%),
      linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0)),
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
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px dashed var(--border);
  }

  .site-header h1 {
    margin: 0 0 8px;
    font-size: clamp(1.9rem, 4vw, 2.8rem);
    line-height: 1;
  }

  .site-header p {
    margin: 0;
    max-width: 64ch;
    color: var(--muted);
    font-size: 0.98rem;
  }

  .feed-shell {
    display: grid;
    gap: 20px;
  }

  .feed-toolbar {
    display: grid;
    gap: 16px;
    padding: 18px 20px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.78);
  }

  .feed-toolbar h2 {
    margin: 0 0 6px;
    font-size: 0.98rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .feed-toolbar p {
    margin: 0;
    color: var(--muted);
  }

  .feed-list {
    display: grid;
    gap: 14px;
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
    font-size: 0.92rem;
    text-align: center;
  }

  .pager-spacer {
    display: block;
    min-height: 1px;
  }

  .card,
  .detail {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 10px 24px rgba(43, 31, 24, 0.06);
  }

  .card::before,
  .detail::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(43, 31, 24, 0.06) 0.8px, transparent 0.8px);
    background-size: 12px 12px;
    opacity: 0.14;
    pointer-events: none;
  }

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
    width: 38px;
    height: 38px;
    border: 1px solid rgba(244, 129, 32, 0.28);
    border-radius: 14px;
    background: rgba(244, 129, 32, 0.08);
    color: var(--accent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  }

  .product-icon {
    width: 23px;
    height: 23px;
    fill: rgba(244, 129, 32, 0.16);
    stroke: rgba(244, 129, 32, 0.38);
    stroke-width: 1.4;
  }

  .product-icon text {
    fill: var(--accent);
    stroke: none;
    font-size: 10px;
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

  .card-actions,
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 18px;
  }

  .feed-card {
    border-radius: 16px;
  }

  .feed-card::before {
    opacity: 0.08;
  }

  .feed-card-body {
    display: grid;
    gap: 14px;
  }

  .feed-card-topline {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
  }

  .feed-card-author {
    display: flex;
    gap: 12px;
    align-items: start;
    min-width: 0;
  }

  .feed-card-avatar {
    width: 42px;
    height: 42px;
    border-radius: 999px;
    border: 1px solid rgba(43, 31, 24, 0.12);
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
    font-size: 0.82rem;
  }

  .feed-card-kicker strong {
    color: var(--text);
    font-weight: 700;
  }

  .feed-card-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: end;
  }

  .feed-inline-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(43, 31, 24, 0.12);
    background: rgba(255, 255, 255, 0.78);
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
  }

  .feed-card-main {
    display: grid;
    gap: 14px;
  }

  .feed-card-copy {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .feed-card-title {
    font-size: 1.12rem;
    line-height: 1.25;
  }

  .feed-title-link {
    text-decoration: none;
  }

  .feed-title-link:hover,
  .feed-title-link:focus-visible {
    color: var(--accent);
  }

  .feed-card-media {
    width: 100%;
    max-width: 210px;
  }

  .feed-card-media .preview-media img,
  .feed-card-media .preview-media-fallback {
    border-radius: 14px;
  }

  .feed-card-actions {
    margin-top: 0;
  }

  .link-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-strong);
    text-decoration: none;
    font-weight: 600;
  }

  .link-button.primary {
    border-color: rgba(244, 129, 32, 0.32);
    background: rgba(244, 129, 32, 0.12);
    color: #c15b07;
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
    .feed-card-main {
      grid-template-columns: minmax(0, 1fr) 190px;
      align-items: start;
    }

    .feed-card-media {
      justify-self: end;
      width: 190px;
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
  subtitle: string;
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
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
