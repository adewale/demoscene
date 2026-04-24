import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveMissingRepositories } from "../../src/lib/missing-repositories";

const repoWordArbitrary = fc.constantFrom(
  "agent",
  "builder",
  "canvas",
  "colorize",
  "demo",
  "edge",
  "worker",
);

function buildRepoUrl(repo: string): string {
  return `https://github.com/adewale/${repo}`;
}

describe("resolveMissingRepositories", () => {
  it("property: incremental mode verifies every known repo missing from the listing", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(repoWordArbitrary, { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(repoWordArbitrary, { maxLength: 5 }),
        (knownRepos, discoveredCandidates) => {
          const knownProjects = new Map(
            knownRepos.map((repo) => [
              buildRepoUrl(repo),
              { slug: `adewale/${repo}` },
            ]),
          );
          const discoveredUrls = new Set(
            discoveredCandidates
              .filter((repo) => knownRepos.includes(repo))
              .map((repo) => buildRepoUrl(repo)),
          );

          const result = resolveMissingRepositories({
            discoveredUrls,
            knownProjects,
            mode: "incremental",
          });

          const missingRepos = knownRepos.filter(
            (repo) => !discoveredUrls.has(buildRepoUrl(repo)),
          );

          expect(result.missingProjectSlugs).toEqual([]);
          expect(
            result.repositoriesToVerify
              .map((repository) => repository.repo)
              .sort(),
          ).toEqual([...missingRepos].sort());
        },
      ),
    );
  });

  it("property: reconcile mode prunes every known repo missing from the listing", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(repoWordArbitrary, { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(repoWordArbitrary, { maxLength: 5 }),
        (knownRepos, discoveredCandidates) => {
          const knownProjects = new Map(
            knownRepos.map((repo) => [
              buildRepoUrl(repo),
              { slug: `adewale/${repo}` },
            ]),
          );
          const discoveredUrls = new Set(
            discoveredCandidates
              .filter((repo) => knownRepos.includes(repo))
              .map((repo) => buildRepoUrl(repo)),
          );

          const result = resolveMissingRepositories({
            discoveredUrls,
            knownProjects,
            mode: "reconcile",
          });

          const missingSlugs = knownRepos
            .filter((repo) => !discoveredUrls.has(buildRepoUrl(repo)))
            .map((repo) => `adewale/${repo}`)
            .sort();

          expect(result.repositoriesToVerify).toEqual([]);
          expect([...result.missingProjectSlugs].sort()).toEqual(missingSlugs);
        },
      ),
    );
  });
});
