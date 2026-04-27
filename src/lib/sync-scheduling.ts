export function rotateValues<T>(values: T[], startIndex: number): T[] {
  if (values.length === 0) {
    return [];
  }

  const normalizedIndex =
    ((startIndex % values.length) + values.length) % values.length;

  return [
    ...values.slice(normalizedIndex),
    ...values.slice(0, normalizedIndex),
  ];
}

export function interleaveRepositoriesByOwner<T extends { owner: string }>(
  repositories: T[],
): T[] {
  const repositoriesByOwner = new Map<string, T[]>();
  const orderedOwners: string[] = [];

  for (const repository of repositories) {
    const existingRepositories = repositoriesByOwner.get(repository.owner);

    if (existingRepositories) {
      existingRepositories.push(repository);
      continue;
    }

    repositoriesByOwner.set(repository.owner, [repository]);
    orderedOwners.push(repository.owner);
  }

  const interleaved: T[] = [];
  let addedRepository = true;

  while (addedRepository) {
    addedRepository = false;

    for (const owner of orderedOwners) {
      const ownerRepositories = repositoriesByOwner.get(owner) ?? [];
      const nextRepository = ownerRepositories.shift();

      if (!nextRepository) {
        continue;
      }

      interleaved.push(nextRepository);
      addedRepository = true;
    }
  }

  return interleaved;
}

export function getNextOwnerCursor(options: {
  currentCursor: number;
  ownersProcessed: number;
  teamCount: number;
}): number {
  if (options.teamCount === 0) {
    return 0;
  }

  return (
    (((options.currentCursor + options.ownersProcessed) % options.teamCount) +
      options.teamCount) %
    options.teamCount
  );
}
