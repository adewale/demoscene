import type { ProjectWithProducts } from "../domain";

import { ProjectCard } from "./ProjectCard";
import {
  TeamMemberMenu,
  TeamMemberRail,
  type TeamMemberOverview,
} from "./TeamMemberDirectory";

type FeedPageProps = {
  page: number;
  projects: ProjectWithProducts[];
  teamMembers: TeamMemberOverview[];
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

export function FeedPage({
  page,
  projects,
  teamMembers,
  totalPages,
}: FeedPageProps) {
  const showTeamDirectory = teamMembers.length > 0;
  let previousDayKey: string | null = null;

  return (
    <div
      className={`feed-layout${showTeamDirectory ? "" : " feed-layout-single-column"}`}
    >
      <div className="feed-main-column">
        {showTeamDirectory ? <TeamMemberMenu members={teamMembers} /> : null}
        {projects.length === 0 ? (
          <section className="empty-state">
            <h2>No Cloudflare repos yet</h2>
            <p>
              Add public GitHub repositories to the source-controlled list and
              run the daily sync.
            </p>
          </section>
        ) : (
          <div className="feed-shell">
            <section aria-label="Project feed" className="feed-list">
              {projects.map((project) => {
                const timestamp = project.repoCreatedAt;
                const currentDayKey = feedDayKey(timestamp);
                const showDayMarker = currentDayKey !== previousDayKey;
                previousDayKey = currentDayKey;

                return (
                  <div key={project.slug} className="feed-entry">
                    {showDayMarker ? (
                      <div className="feed-day-marker" role="separator">
                        <span>{formatFeedDay(timestamp)}</span>
                      </div>
                    ) : null}
                    <ProjectCard project={project} />
                  </div>
                );
              })}
            </section>
            <Pagination page={page} totalPages={totalPages} />
          </div>
        )}
      </div>
      {showTeamDirectory ? <TeamMemberRail members={teamMembers} /> : null}
    </div>
  );
}
