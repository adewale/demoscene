import type { ProjectWithProducts } from "../domain";

import { MarkdownDocument } from "./MarkdownContent";
import { PreviewMedia } from "./PreviewMedia";
import { ProductIconStrip } from "./ProductIconStrip";
import { ProjectMetaRow } from "./ProjectMetaRow";

type ProjectDetailPageProps = {
  project: ProjectWithProducts;
};

export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  return (
    <article className="detail">
      <div className="detail-body detail-layout">
        <div>
          <ProjectMetaRow owner={project.owner} repo={project.repo} />
          <h2 className="project-title">
            {project.owner + "/" + project.repo}
          </h2>
          <MarkdownDocument markdown={project.readmeMarkdown} />
        </div>
        <aside className="detail-sidebar">
          <ProductIconStrip products={project.products} />
          <PreviewMedia
            alt={`${project.repo} preview`}
            previewImageUrl={project.previewImageUrl}
          />
          <div className="detail-actions">
            {project.homepageUrl ? (
              <a
                className="link-button primary"
                href={project.homepageUrl}
                rel="noreferrer"
                target="_blank"
              >
                Visit homepage
              </a>
            ) : null}
            <a
              className="link-button"
              href={project.repoUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open GitHub repo
            </a>
          </div>
        </aside>
      </div>
    </article>
  );
}
