import type { ProjectWithProducts } from "../domain";
import { listCloudflareProductDefinitions } from "../lib/cloudflare-products";
import { formatMarkdownPreviewForCard } from "../lib/markdown/preview";

import { FeedPage } from "./FeedPage";
import { MarkdownPreview } from "./MarkdownContent";
import { ProductIconStrip } from "./ProductIconStrip";
import { ProjectCard } from "./ProjectCard";
import { ProjectMetaRow } from "./ProjectMetaRow";

type DesignPageProps = {
  featuredProject: ProjectWithProducts | null;
  projects: ProjectWithProducts[];
};

function allProducts() {
  return listCloudflareProductDefinitions().map(({ key, label }) => ({
    key,
    label,
  }));
}

export function DesignPage({ featuredProject, projects }: DesignPageProps) {
  const productCatalog = allProducts();
  const featuredPreview = featuredProject
    ? formatMarkdownPreviewForCard(
        featuredProject.readmePreviewMarkdown,
        featuredProject.repo,
      )
    : "";

  return (
    <div className="design-shell">
      <section className="card design-section">
        <div className="card-body design-section-body design-intro">
          <div className="design-heading-block">
            <p className="feed-card-kicker">System view</p>
            <h2 className="project-title design-title">Design language</h2>
            <p className="design-copy">
              This page reuses the exact product chips, card chrome, markdown
              renderer, buttons, and feed primitives that power the rest of the
              site. It exists to make the live system inspectable without
              creating a second visual language.
            </p>
          </div>
          <div className="design-button-row">
            <a className="button-base button-primary" href="/">
              View live feed
            </a>
            <a className="button-base button-secondary" href="/feed.json">
              Inspect feed JSON
            </a>
            <a className="button-base button-ghost" href="/rss.xml">
              Open RSS
            </a>
          </div>
        </div>
      </section>

      <section className="design-section-grid">
        <article className="card design-section">
          <div className="card-body design-section-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Foundations</p>
              <h3 className="project-title design-subtitle">Core tones</h3>
              <p className="design-copy">
                All surfaces derive from the same CSS variables and card shell
                as the main feed.
              </p>
            </div>
            <div className="design-token-grid">
              <div className="design-token-card">
                <span
                  aria-hidden="true"
                  className="design-token-swatch"
                  style={{ background: "var(--bg)" }}
                />
                <strong>Background</strong>
                <span>App canvas</span>
              </div>
              <div className="design-token-card">
                <span
                  aria-hidden="true"
                  className="design-token-swatch"
                  style={{ background: "var(--surface)" }}
                />
                <strong>Surface</strong>
                <span>Resting panels</span>
              </div>
              <div className="design-token-card">
                <span
                  aria-hidden="true"
                  className="design-token-swatch"
                  style={{ background: "var(--surface-strong)" }}
                />
                <strong>Surface strong</strong>
                <span>Featured cards</span>
              </div>
              <div className="design-token-card">
                <span
                  aria-hidden="true"
                  className="design-token-swatch"
                  style={{ background: "var(--accent)" }}
                />
                <strong>Accent</strong>
                <span>Primary actions</span>
              </div>
            </div>
          </div>
        </article>

        <article className="card design-section">
          <div className="card-body design-section-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Typography</p>
              <h3 className="project-title design-subtitle">Live text stack</h3>
            </div>
            {featuredProject ? (
              <div className="design-type-sample">
                <p className="feed-card-kicker">
                  <strong>{featuredProject.owner}</strong> started a new project
                </p>
                <h3 className="project-title feed-card-title">
                  {featuredProject.repo}
                </h3>
                <ProjectMetaRow
                  owner={featuredProject.owner}
                  repo={featuredProject.repo}
                />
                <MarkdownPreview markdown={featuredPreview} />
              </div>
            ) : (
              <section className="empty-state">
                <h3>No featured project yet</h3>
                <p>
                  The design page will pick up live content as the feed fills.
                </p>
              </section>
            )}
          </div>
        </article>
      </section>

      <section className="card design-section">
        <div className="card-body design-section-body">
          <div className="design-heading-block">
            <p className="feed-card-kicker">Product language</p>
            <h3 className="project-title design-subtitle">Cloudflare chips</h3>
            <p className="design-copy">
              These are the same chips the feed uses on live project cards. The
              icon, concise label, tooltip copy, docs URL, and chip tint all
              come from the shared product catalog.
            </p>
          </div>
          <ProductIconStrip products={productCatalog} />
        </div>
      </section>

      <section className="design-section-grid design-section-grid-featured">
        <article className="card design-section">
          <div className="card-body design-section-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Card anatomy</p>
              <h3 className="project-title design-subtitle">
                Live project card
              </h3>
            </div>
            {featuredProject ? <ProjectCard project={featuredProject} /> : null}
          </div>
        </article>

        <article className="card design-section">
          <div className="card-body design-section-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Interaction language</p>
              <h3 className="project-title design-subtitle">Buttons</h3>
              <p className="design-copy">
                The design system keeps actions lightweight: one primary,
                secondary, and ghost treatment reused across the feed.
              </p>
            </div>
            <div className="design-button-row">
              <a className="button-base button-primary" href="/">
                Primary
              </a>
              <a className="button-base button-secondary" href="/feed.json">
                Secondary
              </a>
              <a className="button-base button-ghost" href="/rss.xml">
                Ghost
              </a>
            </div>
          </div>
        </article>
      </section>

      <section className="card design-section">
        <div className="card-body design-section-body">
          <div className="design-heading-block">
            <p className="feed-card-kicker">Composition</p>
            <h3 className="project-title design-subtitle">Feed rhythm</h3>
            <p className="design-copy">
              This excerpt reuses the live feed component and day-marker rhythm
              exactly as the homepage renders it.
            </p>
          </div>
          <FeedPage page={1} projects={projects} totalPages={1} />
        </div>
      </section>
    </div>
  );
}
