import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";

import type { ProjectRecord, ProjectWithProducts } from "../domain";
import {
  CLOUDFLARE_PRODUCT_BY_KEY,
  isCloudflareProductKey,
} from "../lib/cloudflare-products";
import {
  sortCloudflareProducts,
  type CloudflareProduct,
} from "../lib/wrangler/parse";

import { projectProducts, projects } from "./schema";

type Database = ReturnType<typeof import("./client").createDb>;
const PRODUCT_LOOKUP_BATCH_SIZE = 90;

function requireProjectChronology(
  row: typeof projects.$inferSelect,
): Pick<ProjectRecord, "repoCreatedAt" | "repoCreationOrder"> {
  if (row.repoCreatedAt === null || row.repoCreationOrder === null) {
    throw new Error(`Project ${row.slug} is missing chronology metadata`);
  }

  return {
    repoCreatedAt: row.repoCreatedAt,
    repoCreationOrder: row.repoCreationOrder,
  };
}

function projectOrdering() {
  return [
    desc(projects.repoCreatedAt),
    desc(projects.repoCreationOrder),
    desc(projects.firstSeenAt),
  ] as const;
}

async function listProjectProductsForSlugs(
  db: Database,
  slugs: string[],
): Promise<(typeof projectProducts.$inferSelect)[]> {
  const productRows: (typeof projectProducts.$inferSelect)[] = [];

  for (
    let index = 0;
    index < slugs.length;
    index += PRODUCT_LOOKUP_BATCH_SIZE
  ) {
    const batch = slugs.slice(index, index + PRODUCT_LOOKUP_BATCH_SIZE);

    productRows.push(
      ...(await db
        .select()
        .from(projectProducts)
        .where(inArray(projectProducts.projectSlug, batch))),
    );
  }

  return productRows;
}

function attachProducts(
  projectRows: (typeof projects.$inferSelect)[],
  productRows: (typeof projectProducts.$inferSelect)[],
): ProjectWithProducts[] {
  const productsBySlug = new Map<string, CloudflareProduct[]>();

  for (const row of productRows) {
    const existing = productsBySlug.get(row.projectSlug) ?? [];

    if (isCloudflareProductKey(row.productKey)) {
      existing.push({
        key: row.productKey,
        label: CLOUDFLARE_PRODUCT_BY_KEY[row.productKey].label,
      });
    }

    productsBySlug.set(row.projectSlug, existing);
  }

  return projectRows.map((row) => ({
    ...requireProjectChronology(row),
    slug: row.slug,
    owner: row.owner,
    repo: row.repo,
    repoUrl: row.repoUrl,
    homepageUrl: row.homepageUrl,
    branch: row.branch,
    wranglerPath: row.wranglerPath,
    wranglerFormat: row.wranglerFormat,
    readmeMarkdown: row.readmeMarkdown,
    readmePreviewMarkdown: row.readmePreviewMarkdown,
    previewImageUrl: row.previewImageUrl,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    products: sortCloudflareProducts(productsBySlug.get(row.slug) ?? []),
  }));
}

async function hydrateProjects(
  db: Database,
  projectRows: (typeof projects.$inferSelect)[],
): Promise<ProjectWithProducts[]> {
  if (projectRows.length === 0) {
    return [];
  }

  const slugs = projectRows.map((project) => project.slug);
  const productRows = await listProjectProductsForSlugs(db, slugs);

  return attachProducts(projectRows, productRows);
}

export async function upsertProject(
  db: Database,
  project: ProjectRecord,
): Promise<void> {
  await db
    .insert(projects)
    .values(project)
    .onConflictDoUpdate({
      target: projects.slug,
      set: {
        repoUrl: project.repoUrl,
        repoCreationOrder: project.repoCreationOrder,
        repoCreatedAt: project.repoCreatedAt,
        homepageUrl: project.homepageUrl,
        branch: project.branch,
        wranglerPath: project.wranglerPath,
        wranglerFormat: project.wranglerFormat,
        readmeMarkdown: project.readmeMarkdown,
        readmePreviewMarkdown: project.readmePreviewMarkdown,
        previewImageUrl: project.previewImageUrl,
        firstSeenAt: project.firstSeenAt,
        lastSeenAt: project.lastSeenAt,
      },
    });
}

export async function replaceProjectProducts(
  db: Database,
  projectSlug: string,
  productsForProject: CloudflareProduct[],
): Promise<void> {
  await db
    .delete(projectProducts)
    .where(eq(projectProducts.projectSlug, projectSlug));

  if (productsForProject.length === 0) {
    return;
  }

  await db.insert(projectProducts).values(
    productsForProject.map((product) => ({
      projectSlug,
      productKey: product.key,
      productLabel: product.label,
    })),
  );
}

export async function deleteProjectBySlug(
  db: Database,
  slug: string,
): Promise<void> {
  await db.delete(projects).where(eq(projects.slug, slug));
}

export async function getProjectByOwnerRepo(
  db: Database,
  owner: string,
  repo: string,
): Promise<ProjectWithProducts | null> {
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.owner, owner), eq(projects.repo, repo)));

  if (projectRows.length === 0) {
    return null;
  }

  const productRows = await db
    .select()
    .from(projectProducts)
    .where(eq(projectProducts.projectSlug, projectRows[0].slug));

  return attachProducts(projectRows, productRows)[0] ?? null;
}

export async function listProjects(
  db: Database,
): Promise<ProjectWithProducts[]> {
  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(...projectOrdering());

  return hydrateProjects(db, projectRows);
}

export async function countProjects(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(projects);
  return row?.value ?? 0;
}

export async function listProjectsPage(
  db: Database,
  limit: number,
  offset: number,
): Promise<ProjectWithProducts[]> {
  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(...projectOrdering())
    .limit(limit)
    .offset(offset);

  return hydrateProjects(db, projectRows);
}

export async function listProjectSyncStateByOwners(
  db: Database,
  owners: string[],
): Promise<
  Array<{ lastSeenAt: string; owner: string; repoUrl: string; slug: string }>
> {
  if (owners.length === 0) {
    return [];
  }

  return db
    .select({
      lastSeenAt: projects.lastSeenAt,
      owner: projects.owner,
      repoUrl: projects.repoUrl,
      slug: projects.slug,
    })
    .from(projects)
    .where(inArray(projects.owner, owners));
}

export async function deleteProjectsByOwnersNotIn(
  db: Database,
  owners: string[],
): Promise<number> {
  const staleRows = owners.length
    ? await db
        .select({ slug: projects.slug })
        .from(projects)
        .where(notInArray(projects.owner, owners))
    : await db.select({ slug: projects.slug }).from(projects);

  for (const row of staleRows) {
    await deleteProjectBySlug(db, row.slug);
  }

  return staleRows.length;
}
