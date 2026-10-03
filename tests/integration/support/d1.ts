// Every migration that `wrangler d1 migrations apply` would run, in filename
// order. Globbing the directory means a new migration reaches the integration
// suites without anyone updating a copied import list.
const MIGRATIONS = Object.entries(
  import.meta.glob<string>("../../../migrations/*.sql", {
    eager: true,
    import: "default",
    query: "?raw",
  }),
)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, sql]) => sql);

if (MIGRATIONS.length === 0) {
  throw new Error("No migrations found under migrations/*.sql");
}

async function applyMigrationSql(db: D1Database, migrationSql: string) {
  for (const statement of migrationSql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

// Drops every application view and table (tables newest first, so children
// go before the tables they reference) and re-runs all migrations.
export async function resetDatabase(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view')
         AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
       ORDER BY type = 'table', rowid DESC`,
    )
    .all<{ name: string; type: "table" | "view" }>();

  for (const { name, type } of results) {
    await db
      .prepare(`DROP ${type === "view" ? "VIEW" : "TABLE"} IF EXISTS "${name}"`)
      .run();
  }

  for (const migrationSql of MIGRATIONS) {
    await applyMigrationSql(db, migrationSql);
  }
}
