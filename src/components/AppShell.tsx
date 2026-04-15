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
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }

  .site-header {
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px dashed var(--border);
  }

  .eyebrow {
    display: inline-flex;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(244, 129, 32, 0.28);
    background: rgba(244, 129, 32, 0.08);
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .site-header h1 {
    margin: 14px 0 8px;
    font-size: clamp(2rem, 5vw, 3.5rem);
    line-height: 1;
  }

  .site-header p {
    margin: 0;
    max-width: 60ch;
    color: var(--muted);
    font-size: 1rem;
  }

  .feed-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
  }

  .card,
  .detail {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--surface);
    backdrop-filter: blur(14px);
    box-shadow: 0 20px 40px rgba(43, 31, 24, 0.08);
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
    padding: 20px;
  }

  .project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
    color: var(--muted);
    font-size: 0.86rem;
  }

  .project-title {
    margin: 0 0 14px;
    font-size: 1.45rem;
  }

  .product-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
  }

  .product-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 42px;
    padding: 7px 10px;
    border: 1px solid rgba(244, 129, 32, 0.28);
    border-radius: 999px;
    background: rgba(244, 129, 32, 0.08);
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .markdown-preview,
  .markdown-document {
    color: var(--text);
    line-height: 1.6;
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

  .markdown-preview img,
  .markdown-document img,
  .preview-media img {
    width: 100%;
    border-radius: 16px;
  }

  .preview-media {
    margin: 0 0 18px;
  }

  .preview-media img {
    display: block;
    border: 1px solid var(--border);
    object-fit: cover;
    aspect-ratio: 16 / 9;
    background: var(--surface-strong);
  }

  .card-actions,
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 18px;
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
            <span className="eyebrow">Cloudflare projects</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
