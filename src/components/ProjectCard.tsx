import type { ProjectWithProducts } from "../domain";
import { projectPath } from "../lib/paths";

import { MarkdownPreview } from "./MarkdownContent";
import { PreviewMedia } from "./PreviewMedia";
import { ProductIconStrip } from "./ProductIconStrip";
import { ProjectMetaRow } from "./ProjectMetaRow";

type ProjectCardProps = {
  project: ProjectWithProducts;
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="card">
      <div className="card-body">
        <ProjectMetaRow
          firstSeenAt={project.firstSeenAt}
          owner={project.owner}
          repo={project.repo}
        />
        <h2 className="project-title">{project.repo}</h2>
        <ProductIconStrip products={project.products} />
        <PreviewMedia
          alt={`${project.repo} preview`}
          previewImageUrl={project.previewImageUrl}
        />
        <MarkdownPreview markdown={project.readmePreviewMarkdown} />
        <div className="card-actions">
          <a
            className="link-button primary"
            href={projectPath(project.owner, project.repo)}
          >
            Open project
          </a>
          {project.homepageUrl ? (
            <a
              className="link-button"
              href={project.homepageUrl}
              rel="noreferrer"
              target="_blank"
            >
              Visit homepage
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
