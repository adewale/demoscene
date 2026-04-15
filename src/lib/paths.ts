export function projectPath(owner: string, repo: string): string {
  return `/projects/${owner}/${repo}`;
}

export function projectJsonPath(owner: string, repo: string): string {
  return `/projects/${owner}/${repo}.json`;
}
