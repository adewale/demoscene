import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildQueueJobId,
  buildQueueSemanticKey,
  isTerminalQueueJobStatus,
  parseQueueMessage,
  type QueueJobStatus,
  type QueueMessageBody,
} from "../../src/lib/queue/messages";

const ownerArbitrary = fc
  .stringMatching(/[a-z][a-z0-9-]{0,20}/)
  .filter((value) => !value.endsWith("-"));
const repoArbitrary = fc
  .stringMatching(/[a-z][a-z0-9._-]{0,30}/)
  .filter((value) => !value.endsWith("."));
const modeArbitrary = fc.constantFrom("incremental", "reconcile" as const);

describe("queue message contracts", () => {
  it("validates scan-owner messages and rejects unsupported schema versions", () => {
    const message = parseQueueMessage({
      correlationId: "corr-1",
      cursor: 2,
      kind: "scan-owner",
      mode: "incremental",
      owner: "adewale",
      runId: "42",
      schemaVersion: 1,
      scheduledAt: "2026-04-28T12:00:00.000Z",
    });

    expect(message).toEqual({
      correlationId: "corr-1",
      cursor: 2,
      kind: "scan-owner",
      mode: "incremental",
      owner: "adewale",
      runId: "42",
      schemaVersion: 1,
      scheduledAt: "2026-04-28T12:00:00.000Z",
    });
    expect(() => parseQueueMessage({ ...message, schemaVersion: 999 })).toThrow(
      /schemaVersion/i,
    );
    expect(() => parseQueueMessage({ ...message, owner: "" })).toThrow(
      /owner/i,
    );
  });

  it("uses deterministic per-run job IDs and cross-run semantic keys", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        modeArbitrary,
        ownerArbitrary,
        repoArbitrary,
        (firstRunId, secondRunId, mode, owner, repo) => {
          const firstMessage: QueueMessageBody = {
            correlationId: "corr-1",
            discoveredAt: "2026-04-28T12:00:05.000Z",
            kind: "sync-repo",
            mode,
            owner,
            repo,
            repoUrl: `https://github.com/${owner}/${repo}`,
            runId: firstRunId,
            schemaVersion: 1,
          };
          const duplicateMessage = { ...firstMessage };
          const secondRunMessage = { ...firstMessage, runId: secondRunId };

          expect(buildQueueJobId(firstMessage)).toBe(
            buildQueueJobId(duplicateMessage),
          );
          expect(buildQueueSemanticKey(firstMessage)).toBe(
            buildQueueSemanticKey(secondRunMessage),
          );

          if (firstRunId !== secondRunId) {
            expect(buildQueueJobId(firstMessage)).not.toBe(
              buildQueueJobId(secondRunMessage),
            );
          }
        },
      ),
    );
  });

  it("validates repo and missing-repo messages with repo-scoped identity", () => {
    const syncRepo = parseQueueMessage({
      correlationId: "corr-1",
      discoveredAt: "2026-04-28T12:00:05.000Z",
      kind: "sync-repo",
      mode: "reconcile",
      owner: "adewale",
      repo: "demoscene",
      repoUrl: "https://github.com/adewale/demoscene",
      runId: "42",
      schemaVersion: 1,
    });
    const verifyMissingRepo = parseQueueMessage({
      correlationId: "corr-1",
      kind: "verify-missing-repo",
      mode: "incremental",
      owner: "adewale",
      repo: "old-demo",
      repoUrl: "https://github.com/adewale/old-demo",
      runId: "42",
      schemaVersion: 1,
    });

    expect(syncRepo).toEqual(
      expect.objectContaining({
        discoveredAt: "2026-04-28T12:00:05.000Z",
        kind: "sync-repo",
        mode: "reconcile",
        repo: "demoscene",
      }),
    );
    expect(verifyMissingRepo).toEqual(
      expect.objectContaining({
        kind: "verify-missing-repo",
        mode: "incremental",
        repo: "old-demo",
      }),
    );
    expect(buildQueueJobId(syncRepo)).toBe(
      "42:sync-repo:reconcile:adewale/demoscene",
    );
    expect(buildQueueSemanticKey(verifyMissingRepo)).toBe(
      "verify-missing-repo:adewale/old-demo",
    );
  });

  it("rejects malformed message variants with specific validation errors", () => {
    const baseScanOwner = {
      correlationId: "corr-1",
      cursor: 0,
      kind: "scan-owner",
      mode: "incremental",
      owner: "adewale",
      runId: "42",
      schemaVersion: 1,
      scheduledAt: "2026-04-28T12:00:00.000Z",
    };

    expect(() => parseQueueMessage(null)).toThrow(/object/i);
    expect(() =>
      parseQueueMessage({ ...baseScanOwner, kind: "unknown" }),
    ).toThrow(/kind/i);
    expect(() => parseQueueMessage({ ...baseScanOwner, mode: "full" })).toThrow(
      /mode/i,
    );
    expect(() => parseQueueMessage({ ...baseScanOwner, cursor: -1 })).toThrow(
      /cursor/i,
    );
    expect(() =>
      parseQueueMessage({ ...baseScanOwner, scheduledAt: "" }),
    ).toThrow(/scheduledAt/i);
  });

  it("classifies only final queue states as terminal", () => {
    const terminalStatuses: QueueJobStatus[] = [
      "cancelled",
      "deferred",
      "failed",
      "succeeded",
    ];
    const activeStatuses: QueueJobStatus[] = ["processing", "queued"];

    for (const status of terminalStatuses) {
      expect(isTerminalQueueJobStatus(status)).toBe(true);
    }

    for (const status of activeStatuses) {
      expect(isTerminalQueueJobStatus(status)).toBe(false);
    }
  });
});
