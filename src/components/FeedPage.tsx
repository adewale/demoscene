import type { ProjectWithProducts } from "../domain";

import { ProjectCard } from "./ProjectCard";

type FeedPageProps = {
  page: number;
  pageSize: number;
  projects: ProjectWithProducts[];
  totalPages: number;
  totalProjects: number;
};

function buildPageHref(page: number): string {
  return page <= 1 ? "/" : `/?page=${page}`;
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pagination" className="feed-pager">
      {page > 1 ? (
        <a className="link-button" href={buildPageHref(page - 1)}>
          Newer
        </a>
      ) : (
        <span className="pager-spacer" />
      )}
      <span className="pager-label">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <a className="link-button primary" href={buildPageHref(page + 1)}>
          Older
        </a>
      ) : (
        <span className="pager-spacer" />
      )}
    </nav>
  );
}

export function FeedPage({
  page,
  pageSize,
  projects,
  totalPages,
  totalProjects,
}: FeedPageProps) {
  if (projects.length === 0) {
    return (
      <section className="empty-state">
        <h2>No Cloudflare repos yet</h2>
        <p>
          Add public GitHub repositories to the source-controlled list and run
          the daily sync.
        </p>
      </section>
    );
  }

  return (
    <div className="feed-shell">
      <section className="feed-toolbar" aria-label="Feed summary">
        <div>
          <h2>Latest project feed</h2>
          <p>
            Newest first. Showing {projects.length} of {totalProjects} items,{" "}
            {pageSize} per page.
          </p>
        </div>
        <Pagination page={page} totalPages={totalPages} />
      </section>
      <section aria-label="Project feed" className="feed-list">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </section>
      <Pagination page={page} totalPages={totalPages} />
    </div>
  );
}
