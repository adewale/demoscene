import type { ProjectWithProducts } from "../domain";

import { ProjectCard } from "./ProjectCard";

type FeedPageProps = {
  page: number;
  projects: ProjectWithProducts[];
  totalPages: number;
};

function buildPageHref(page: number): string {
  return page <= 1 ? "/" : `/?page=${page}`;
}

function feedDayKey(isoString: string): string {
  return isoString.slice(0, 10);
}

function formatFeedDay(isoString: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(isoString));
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
        <a
          className="button-base button-secondary"
          href={buildPageHref(page - 1)}
        >
          Newer
        </a>
      ) : (
        <span className="pager-spacer" />
      )}
      <span className="pager-label">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <a
          className="button-base button-primary"
          href={buildPageHref(page + 1)}
        >
          Older
        </a>
      ) : (
        <span className="pager-spacer" />
      )}
    </nav>
  );
}

export function FeedPage({ page, projects, totalPages }: FeedPageProps) {
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

  let previousDayKey: string | null = null;

  return (
    <div className="feed-shell">
      <section aria-label="Project feed" className="feed-list">
        {projects.map((project) => {
          const currentDayKey = feedDayKey(project.firstSeenAt);
          const showDayMarker = currentDayKey !== previousDayKey;
          previousDayKey = currentDayKey;

          return (
            <div key={project.slug} className="feed-entry">
              {showDayMarker ? (
                <div className="feed-day-marker" role="separator">
                  <span>{formatFeedDay(project.firstSeenAt)}</span>
                </div>
              ) : null}
              <ProjectCard project={project} />
            </div>
          );
        })}
      </section>
      <Pagination page={page} totalPages={totalPages} />
    </div>
  );
}
