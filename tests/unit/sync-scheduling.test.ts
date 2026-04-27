import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  getNextOwnerCursor,
  interleaveRepositoriesByOwner,
  rotateValues,
} from "../../src/lib/sync-scheduling";

type OwnedItem = {
  owner: string;
  value: string;
};

const ownerArbitrary = fc.constantFrom(
  "adewale",
  "craigsdennis",
  "fayazara",
  "jillesme",
  "zeke",
);

describe("rotateValues", () => {
  it("property: preserves membership and order from the chosen start index", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string(), { maxLength: 12 }), (values) => {
        const rotated = rotateValues(values, values.length + 3);
        const normalizedStart = values.length === 0 ? 0 : 3 % values.length;

        expect(rotated).toEqual(
          values.length === 0
            ? []
            : [
                ...values.slice(normalizedStart),
                ...values.slice(0, normalizedStart),
              ],
        );
      }),
    );
  });
});

describe("interleaveRepositoriesByOwner", () => {
  it("keeps each owner's relative order while interleaving owners", () => {
    const interleaved = interleaveRepositoriesByOwner<OwnedItem>([
      { owner: "adewale", value: "a-1" },
      { owner: "adewale", value: "a-2" },
      { owner: "craigsdennis", value: "c-1" },
      { owner: "craigsdennis", value: "c-2" },
      { owner: "fayazara", value: "f-1" },
    ]);

    expect(interleaved.map((item) => item.value)).toEqual([
      "a-1",
      "c-1",
      "f-1",
      "a-2",
      "c-2",
    ]);
  });

  it("property: preserves each owner's relative order", () => {
    fc.assert(
      fc.property(fc.array(ownerArbitrary, { maxLength: 16 }), (owners) => {
        const items = owners.map((owner, index) => ({
          owner,
          value: `${owner}-${index}`,
        }));
        const interleaved = interleaveRepositoriesByOwner(items);

        expect(
          [...interleaved].sort((left, right) =>
            left.value.localeCompare(right.value),
          ),
        ).toEqual(
          [...items].sort((left, right) =>
            left.value.localeCompare(right.value),
          ),
        );

        for (const owner of new Set(owners)) {
          expect(
            interleaved
              .filter((item) => item.owner === owner)
              .map((item) => item.value),
          ).toEqual(
            items
              .filter((item) => item.owner === owner)
              .map((item) => item.value),
          );
        }
      }),
    );
  });
});

describe("getNextOwnerCursor", () => {
  it("property: always returns a valid cursor for the owner list", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        (teamCount, currentCursor, ownersProcessed) => {
          const nextCursor = getNextOwnerCursor({
            currentCursor,
            ownersProcessed,
            teamCount,
          });

          expect(nextCursor).toBeGreaterThanOrEqual(0);
          expect(nextCursor).toBeLessThan(teamCount);
        },
      ),
    );
  });
});
