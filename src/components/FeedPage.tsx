import type { ProjectWithProducts } from "../domain";

import { ProjectCard } from "./ProjectCard";

type FeedPageProps = {
  projects: ProjectWithProducts[];
};

export function FeedPage({ projects }: FeedPageProps) {
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
    <section aria-label="Project feed" className="feed-grid">
      {projects.map((project) => (
        <ProjectCard key={project.slug} project={project} />
      ))}
    </section>
  );
}
