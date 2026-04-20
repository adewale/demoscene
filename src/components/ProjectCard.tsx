import type { ProjectWithProducts } from "../domain";
import { extractProjectPresence } from "../lib/project-presence";

import { MarkdownPreview } from "./MarkdownContent";
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

function takeFirstParagraphs(markdown: string, count: number): string {
  return markdown
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, count)
    .join("\n\n");
}

export function ProjectCard({ project }: ProjectCardProps) {
  const previewMarkdown = takeFirstParagraphs(
    stripPreviewNoise(
      stripLeadingHeading(project.readmePreviewMarkdown, project.repo),
    ),
    2,
  );
  const presenceItems = extractProjectPresence({
    homepageUrl: project.homepageUrl,
    readmeMarkdown: project.readmeMarkdown,
    repoUrl: project.repoUrl,
  }).filter((item) => item.kind !== "github");

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
              <p className="feed-card-kicker">
                <strong>{project.owner}</strong> started a new project
              </p>
              <ProjectMetaRow owner={project.owner} repo={project.repo} />
            </div>
          </div>
        </div>

        <div className="feed-card-copy">
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
          <ProductIconStrip products={project.products} />
          <MarkdownPreview markdown={previewMarkdown} />
        </div>

        {presenceItems.length > 0 ? (
          <div className="feed-card-links">
            {presenceItems.map((item) => (
              <a
                key={`${item.kind}-${item.href}`}
                className={`button-base ${
                  item.kind === "live"
                    ? "button-primary"
                    : item.kind === "video"
                      ? "button-secondary"
                      : "button-ghost"
                } feed-inline-link feed-inline-link-${item.kind}`}
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                {item.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
