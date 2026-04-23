import type { RepositoryScanStatus, SyncMode } from "../domain";

export const FEED_PAGE_SIZE = 24;
export const POSITIVE_REVISIT_AFTER_DAYS = 14;
export const REPOSITORY_SCAN_REVISIT_DAYS: Record<
  RepositoryScanStatus,
  number
> = {
  ignored: 30,
  invalid_config: 7,
};
export const RSS_ITEM_LIMIT = 50;

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getRepositoryScanNextCheckAt(
  status: RepositoryScanStatus,
  checkedAt: Date,
): string {
  return addDays(checkedAt, REPOSITORY_SCAN_REVISIT_DAYS[status]).toISOString();
}

export function shouldProcessDiscoveredRepository(options: {
  existingProjectLastSeenAt?: string | null;
  mode: SyncMode;
  negativeScanNextCheckAt?: string | null;
  now: Date;
}): boolean {
  const { existingProjectLastSeenAt, negativeScanNextCheckAt, now } = options;

  if (existingProjectLastSeenAt) {
    return (
      new Date(existingProjectLastSeenAt) <=
      addDays(now, -POSITIVE_REVISIT_AFTER_DAYS)
    );
  }

  if (!negativeScanNextCheckAt) {
    return true;
  }

  return new Date(negativeScanNextCheckAt) <= now;
}
