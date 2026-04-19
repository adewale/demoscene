type ProjectMetaRowProps = {
  owner: string;
  repo: string;
};

export function ProjectMetaRow({ owner, repo }: ProjectMetaRowProps) {
  return (
    <div className="project-meta">
      <span>{owner}</span>
      <span>/</span>
      <span>{repo}</span>
    </div>
  );
}
