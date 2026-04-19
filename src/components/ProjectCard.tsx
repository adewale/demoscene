import type { ProjectWithProducts } from "../domain";
import { projectPath } from "../lib/paths";

import { MarkdownPreview } from "./MarkdownContent";
import { PreviewMedia } from "./PreviewMedia";
import { ProductIconStrip } from "./ProductIconStrip";
import { ProjectMetaRow } from "./ProjectMetaRow";

type ProjectCardProps = {
  project: ProjectWithProducts;
};

function githubAvatarUrl(owner: string): string {
  return `https://github.com/${owner}.png?size=80`;
}

function stripLeadingHeading(markdown: string, repo: string): string {
  const normalized = markdown.trim();
  const lines = normalized.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const slug = repo.replace(/[._-]+/g, " ").toLowerCase();
  const headingText = firstLine
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase();

  if (!firstLine.startsWith("#") || headingText !== slug) {
    return markdown;
  }

  return lines.slice(1).join("\n").trim() || markdown;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const previewMarkdown = stripLeadingHeading(
    project.readmePreviewMarkdown,
    project.repo,
  );

  return (
    <article className="card feed-card">
      <div className="card-body feed-card-body">
        <div className="feed-card-topline">
          <div className="feed-card-author">
            <img
              alt={`${project.owner} avatar`}
              className="feed-card-avatar"
              loading="lazy"
              src={githubAvatarUrl(project.owner)}
            />
            <div className="feed-card-author-copy">
              <p className="feed-card-kicker">
                <strong>{project.owner}</strong> started a new project
              </p>
              <ProjectMetaRow
                firstSeenAt={project.firstSeenAt}
                owner={project.owner}
                repo={project.repo}
              />
            </div>
          </div>
          <div className="feed-card-links">
            <a
              className="feed-inline-link"
              href={project.repoUrl}
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            {project.homepageUrl ? (
              <a
                className="feed-inline-link"
                href={project.homepageUrl}
                rel="noreferrer"
                target="_blank"
              >
                Visit homepage
              </a>
            ) : null}
          </div>
        </div>

        <div className="feed-card-main">
          <div className="feed-card-copy">
            <h2 className="project-title feed-card-title">
              <a
                className="feed-title-link"
                href={projectPath(project.owner, project.repo)}
              >
                {project.repo}
              </a>
            </h2>
            <ProductIconStrip products={project.products} />
            <MarkdownPreview markdown={previewMarkdown} />
          </div>
          <div className="feed-card-media">
            <PreviewMedia
              alt={`${project.repo} preview`}
              previewImageUrl={project.previewImageUrl}
            />
          </div>
        </div>

        <div className="card-actions feed-card-actions">
          <a
            className="link-button"
            href={projectPath(project.owner, project.repo)}
          >
            Open feed item
          </a>
        </div>
      </div>
    </article>
  );
}
