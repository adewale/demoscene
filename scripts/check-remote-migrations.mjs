import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { getPendingMigrationNames } from "./lib/pending-migrations.mjs";

function listLocalMigrationNames() {
  return readdirSync(resolve(process.cwd(), "migrations"))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
}

function listAppliedRemoteMigrationNames() {
  const output = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--json",
      "--config",
      "wrangler.jsonc",
      "--command",
      "select name from d1_migrations order by id;",
    ],
    { encoding: "utf8" },
  );
  const payload = JSON.parse(output);

  return (payload[0]?.results ?? [])
    .map((row) => row.name)
    .filter((name) => Boolean(name));
}

const localMigrationNames = listLocalMigrationNames();
const appliedRemoteMigrationNames = listAppliedRemoteMigrationNames();
const pendingMigrationNames = getPendingMigrationNames(
  localMigrationNames,
  appliedRemoteMigrationNames,
);

if (pendingMigrationNames.length > 0) {
  globalThis.console.error(
    `Remote D1 is missing migrations: ${pendingMigrationNames.join(", ")}`,
  );
  process.exit(1);
}

globalThis.console.log("Remote D1 migration state is up to date.");
