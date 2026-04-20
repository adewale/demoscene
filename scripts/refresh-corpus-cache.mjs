import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_FEED_URL = "https://demoscene.adewale-883.workers.dev/feed.json";
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.CORPUS_OUTPUT_DIR ?? "corpus-cache",
);
const fetchImpl = globalThis.fetch;

if (typeof fetchImpl !== "function") {
  throw new Error("Global fetch is required to refresh the corpus cache");
}

function ensureObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function ensureString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }

  return value;
}

function repositoryDirectory(owner, repo) {
  return path.join(OUTPUT_DIR, "projects", owner, repo);
}

async function fetchJson(url) {
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchOptionalText(url) {
  const response = await fetchImpl(url);

  if (response.status === 404) {
    return { kind: "not_found" };
  }

  if (!response.ok) {
    return { kind: "error", status: response.status };
  }

  return { kind: "found", contents: await response.text() };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const feedUrl = process.env.CORPUS_FEED_URL ?? DEFAULT_FEED_URL;
  const payload = ensureObject(
    await fetchJson(feedUrl),
    "Feed payload must be an object",
  );
  const items = payload.items;

  if (!Array.isArray(items)) {
    throw new Error("Feed payload must include an items array");
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await rm(path.join(OUTPUT_DIR, "projects"), { force: true, recursive: true });
  await rm(path.join(OUTPUT_DIR, "manifest.json"), { force: true });
  await mkdir(path.join(OUTPUT_DIR, "projects"), { recursive: true });

  const manifest = [];

  for (const item of items) {
    const project = ensureObject(item, "Feed item must be an object");
    const owner = ensureString(
      project.owner,
      "Feed item owner must be a string",
    );
    const repo = ensureString(project.repo, "Feed item repo must be a string");
    const branch = ensureString(
      project.branch,
      `Feed item ${owner}/${repo} branch must be a string`,
    );
    const wranglerPath = ensureString(
      project.wranglerPath,
      `Feed item ${owner}/${repo} wranglerPath must be a string`,
    );
    const repoDir = repositoryDirectory(owner, repo);
    const wranglerUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${wranglerPath}`;
    const packageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;
    const wranglerResult = await fetchOptionalText(wranglerUrl);
    const packageResult = await fetchOptionalText(packageUrl);

    await mkdir(repoDir, { recursive: true });

    if (wranglerResult.kind === "found") {
      await writeFile(
        path.join(repoDir, path.basename(wranglerPath)),
        wranglerResult.contents,
        "utf8",
      );
    }

    if (packageResult.kind === "found") {
      await writeFile(
        path.join(repoDir, "package.json"),
        packageResult.contents,
        "utf8",
      );
    }

    const metadata = {
      branch,
      owner,
      packageJson: packageResult.kind,
      packageJsonStatus:
        packageResult.kind === "error" ? packageResult.status : null,
      packageJsonUrl: packageUrl,
      repo,
      repoUrl: ensureString(
        project.repoUrl,
        "Feed item repoUrl must be a string",
      ),
      wranglerPath,
      wranglerStatus:
        wranglerResult.kind === "error" ? wranglerResult.status : null,
      wranglerUrl,
    };

    await writeJson(path.join(repoDir, "metadata.json"), metadata);
    manifest.push(metadata);
  }

  await writeJson(path.join(OUTPUT_DIR, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    projectCount: manifest.length,
    projects: manifest,
    sourceFeedUrl: feedUrl,
  });
}

main().catch((error) => {
  globalThis.console.error(error);
  process.exitCode = 1;
});
