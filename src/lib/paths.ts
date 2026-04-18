function encodeProjectSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/\./g, "%2E");
}

export function projectPath(owner: string, repo: string): string {
  return `/projects/${encodeProjectSegment(owner)}/${encodeProjectSegment(repo)}`;
}

export function projectJsonPath(owner: string, repo: string): string {
  return `/projects/${encodeProjectSegment(owner)}/${encodeProjectSegment(repo)}.json`;
}
