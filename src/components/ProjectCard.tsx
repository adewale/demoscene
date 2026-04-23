import type { ProjectWithProducts } from "../domain";
import { githubAvatarUrl } from "../lib/github/avatar";
import { formatMarkdownPreviewForCard } from "../lib/markdown/preview";

import { MarkdownPreview } from "./MarkdownContent";
import { ProductIconStrip } from "./ProductIconStrip";

type ProjectCardProps = {
  project: ProjectWithProducts;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const previewMarkdown = formatMarkdownPreviewForCard(
    project.readmePreviewMarkdown,
    project.repo,
  );

  return (
    <article className="card feed-card">
      <span aria-hidden="true" className="card-corner card-corner-tl" />
      <span aria-hidden="true" className="card-corner card-corner-tr" />
      <span aria-hidden="true" className="card-corner card-corner-bl" />
      <span aria-hidden="true" className="card-corner card-corner-br" />
      <div className="card-body feed-card-body">
        <div className="feed-card-topline">
          <div className="feed-card-author">
            <img
              alt={`${project.owner} avatar`}
              className="feed-card-avatar"
              decoding="async"
              height="40"
              loading="lazy"
              src={githubAvatarUrl(project.owner)}
              width="40"
            />
            <div className="feed-card-author-copy">
              <div className="feed-card-headline-row">
                <p className="feed-card-kicker">
                  <strong>{project.owner}</strong> started a new project
                </p>
                <h2 className="project-title feed-card-title">
                  <a
                    className="feed-title-link"
                    href={project.repoUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {project.repo}
                  </a>
                </h2>
              </div>
            </div>
          </div>
        </div>

        <div className="feed-card-copy">
          <ProductIconStrip products={project.products} />
          <MarkdownPreview markdown={previewMarkdown} />
        </div>
      </div>
    </article>
  );
}
