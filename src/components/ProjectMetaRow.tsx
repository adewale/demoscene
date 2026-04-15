import { formatDate } from "../lib/format";

type ProjectMetaRowProps = {
  owner: string;
  repo: string;
  firstSeenAt: string;
};

export function ProjectMetaRow({
  firstSeenAt,
  owner,
  repo,
}: ProjectMetaRowProps) {
  return (
    <div className="project-meta">
      <span>{owner}</span>
      <span>/</span>
      <span>{repo}</span>
      <span>•</span>
      <span>{formatDate(firstSeenAt)}</span>
    </div>
  );
}
