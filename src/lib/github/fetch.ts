import type { ParsedRepositoryUrl } from "./repositories";
import { buildRawFileCandidates } from "./repositories";

export type FetchLike = typeof fetch;

type RawFileResult = {
  branch: string;
  fileName: string;
  contents: string;
};

export const README_FILE_NAMES = ["README.md"];
export const WRANGLER_FILE_NAMES = [
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
];

export async function fetchRepositoryPage(
  fetchImpl: FetchLike,
  repository: ParsedRepositoryUrl,
) {
  const response = await fetchImpl(repository.url);

  return {
    status: response.status,
    ok: response.ok,
    html: response.ok ? await response.text() : null,
  };
}

export async function fetchFirstAvailableRawFile(
  fetchImpl: FetchLike,
  repository: ParsedRepositoryUrl,
  fileNames: string[],
): Promise<RawFileResult | null> {
  const candidates = buildRawFileCandidates(
    repository.owner,
    repository.repo,
    fileNames,
  );

  for (const candidate of candidates) {
    const response = await fetchImpl(candidate.url);

    if (!response.ok) {
      continue;
    }

    return {
      branch: candidate.branch,
      fileName: candidate.fileName,
      contents: await response.text(),
    };
  }

  return null;
}
