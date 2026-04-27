export function getPendingMigrationNames(
  localMigrationNames: string[],
  appliedMigrationNames: string[],
): string[] {
  const appliedMigrationNameSet = new Set(appliedMigrationNames);

  return localMigrationNames.filter(
    (migrationName) => !appliedMigrationNameSet.has(migrationName),
  );
}
