export function githubAvatarUrl(login: string, size = 80): string {
  return `https://github.com/${login}.png?size=${size}`;
}
