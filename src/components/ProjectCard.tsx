import type { ProjectWithProducts } from "../domain";
import { projectPath } from "../lib/paths";
import { extractProjectPresence } from "../lib/project-presence";

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

function stripPreviewNoise(markdown: string): string {
  return markdown
    .split("\n")
    .filter(
      (line) =>
        !line.includes("deploy.workers.cloudflare.com/button") &&
        !/\[!\[[^\]]*deploy to cloudflare/i.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ProjectCard({ project }: ProjectCardProps) {
  const previewMarkdown = stripPreviewNoise(
    stripLeadingHeading(project.readmePreviewMarkdown, project.repo),
  );
  const presenceItems = extractProjectPresence({
    homepageUrl: project.homepageUrl,
    readmeMarkdown: project.readmeMarkdown,
    repoUrl: project.repoUrl,
  });

  return (
    <article className="card feed-card">
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
              <p className="feed-card-kicker">
                <strong>{project.owner}</strong> started a new project
              </p>
              <ProjectMetaRow owner={project.owner} repo={project.repo} />
            </div>
          </div>
          <div className="feed-card-links">
            {presenceItems.map((item) => (
              <a
                key={`${item.kind}-${item.href}`}
                className={`feed-inline-link feed-inline-link-${item.kind}`}
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                {item.label}
              </a>
            ))}
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
      </div>
    </article>
  );
}
