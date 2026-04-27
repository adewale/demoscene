import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { getPendingMigrationNames } from "../../src/lib/pending-migrations";

const migrationNameArbitrary = fc
  .tuple(
    fc.integer({ min: 1, max: 9999 }),
    fc.constantFrom("initial", "projects", "scan-state", "sync-runs"),
  )
  .map(([index, suffix]) => `${String(index).padStart(4, "0")}_${suffix}.sql`);

describe("getPendingMigrationNames", () => {
  it("returns local migrations that are not yet applied", () => {
    expect(
      getPendingMigrationNames(
        ["0001_initial.sql", "0002_projects.sql", "0003_sync-runs.sql"],
        ["0001_initial.sql", "0002_projects.sql"],
      ),
    ).toEqual(["0003_sync-runs.sql"]);
  });

  it("property: preserves local order while removing every applied migration", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(migrationNameArbitrary, { maxLength: 12 })
          .map((names) => [...names].sort()),
        fc.uniqueArray(migrationNameArbitrary, { maxLength: 6 }),
        (localMigrationNames, extraAppliedMigrationNames) => {
          const appliedMigrationNames = [
            ...localMigrationNames.filter((_, index) => index % 2 === 0),
            ...extraAppliedMigrationNames,
          ];

          expect(
            getPendingMigrationNames(
              localMigrationNames,
              appliedMigrationNames,
            ),
          ).toEqual(
            localMigrationNames.filter(
              (migrationName) => !appliedMigrationNames.includes(migrationName),
            ),
          );
        },
      ),
    );
  });
});
