import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  getRepositoryScanNextCheckAt,
  shouldProcessDiscoveredRepository,
} from "../../src/lib/sync-policy";

const safeDateArbitrary = fc
  .date({
    max: new Date("2035-12-31T23:59:59.999Z"),
    min: new Date("2000-01-01T00:00:00.000Z"),
  })
  .filter((date) => !Number.isNaN(date.valueOf()));

describe("sync policy", () => {
  it("always schedules the next negative-cache check after the check time", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ignored", "invalid_config"),
        safeDateArbitrary,
        (status, checkedAt) => {
          const nextCheckAt = getRepositoryScanNextCheckAt(status, checkedAt);

          expect(new Date(nextCheckAt) > checkedAt).toBe(true);
        },
      ),
    );
  });

  it("does not revisit a negative-cached repo before its scheduled retry time", () => {
    fc.assert(
      fc.property(
        safeDateArbitrary,
        fc.integer({ min: 1, max: 30 }),
        (now, days) => {
          const nextCheckAt = new Date(now);
          nextCheckAt.setUTCDate(nextCheckAt.getUTCDate() + days);

          expect(
            shouldProcessDiscoveredRepository({
              mode: "incremental",
              negativeScanNextCheckAt: nextCheckAt.toISOString(),
              now,
            }),
          ).toBe(false);
        },
      ),
    );
  });

  it("revisits a negative-cached repo once its scheduled retry time arrives", () => {
    fc.assert(
      fc.property(
        safeDateArbitrary,
        fc.integer({ min: 0, max: 30 }),
        (now, days) => {
          const nextCheckAt = new Date(now);
          nextCheckAt.setUTCDate(nextCheckAt.getUTCDate() - days);

          expect(
            shouldProcessDiscoveredRepository({
              mode: "reconcile",
              negativeScanNextCheckAt: nextCheckAt.toISOString(),
              now,
            }),
          ).toBe(true);
        },
      ),
    );
  });
});
