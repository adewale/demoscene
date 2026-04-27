export function getPendingMigrationNames(
  localMigrationNames,
  appliedMigrationNames,
) {
  const appliedMigrationNameSet = new Set(appliedMigrationNames);

  return localMigrationNames.filter(
    (migrationName) => !appliedMigrationNameSet.has(migrationName),
  );
}
