const GITHUB_HOST = "github.com";
const BRANCHES = ["main", "master"] as const;

export type ParsedRepositoryUrl = {
  owner: string;
  repo: string;
  slug: string;
  url: string;
};

type RawFileCandidate = {
  branch: (typeof BRANCHES)[number];
  fileName: string;
  url: string;
};

export function normalizeRepositoryUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

export function parseRepositoryUrl(input: string): ParsedRepositoryUrl {
  const normalized = normalizeRepositoryUrl(input);
  const url = new URL(normalized);

  if (url.protocol !== "https:" || url.hostname !== GITHUB_HOST) {
    throw new Error(`Unsupported repository URL: ${input}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length !== 2) {
    throw new Error(
      `Repository URL must match https://github.com/:owner/:repo: ${input}`,
    );
  }

  const [owner, repo] = segments;

  return {
    owner,
    repo,
    slug: `${owner}/${repo}`,
    url: `https://${GITHUB_HOST}/${owner}/${repo}`,
  };
}

export function buildRawFileCandidates(
  owner: string,
  repo: string,
  fileNames: string[],
): RawFileCandidate[] {
  return fileNames.flatMap((fileName) =>
    BRANCHES.map((branch) => ({
      branch,
      fileName,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileName}`,
    })),
  );
}
