import type { AppEnv, SyncMode, SyncSummary } from "../domain";
import { TEAM_MEMBERS, type TeamMember } from "../config/repositories";
import { createDb } from "../db/client";
import {
  acquireSyncPlannerLock,
  getSyncRunByPlanningKey,
  insertSyncRun,
  insertSyncRunPhase,
  listDueDeferredSyncRunJobs,
  requeueSyncRunJob,
  releaseSyncPlannerLock,
  upsertSyncRunJob,
} from "../db/queries";
import {
  parseQueueMessage,
  type QueueMessageBody,
  type ScanOwnerQueueMessage,
} from "../lib/queue/messages";
import { getNextOwnerCursor, rotateValues } from "../lib/sync-scheduling";

const PLANNER_LOCK_NAME = "scheduled";
const PLANNER_LOCK_DURATION_MS = 10 * 60 * 1000;

function createEmptyQueueSummary(): SyncSummary {
  return {
    accountsFailed: 0,
    accountsScanned: 0,
    accountsSucceeded: 0,
    rateLimitedUntil: null,
    reposAdded: 0,
    reposDeferredByRateLimit: 0,
    reposDiscovered: 0,
    reposInvalidConfig: 0,
    reposRemoved: 0,
    reposSkippedTransiently: 0,
    reposUpdated: 0,
  };
}

function createCorrelationId(options: {
  cron: string;
  mode: SyncMode;
  scheduledAt: string;
}): string {
  return `queue:${options.mode}:${options.cron}:${options.scheduledAt}`;
}

function createPlanningKey(options: {
  cron: string;
  mode: SyncMode;
  scheduledAt: string;
}): string {
  return `${options.mode}:${options.cron}:${options.scheduledAt}`;
}

function addMilliseconds(isoTimestamp: string, milliseconds: number): string {
  return new Date(
    new Date(isoTimestamp).valueOf() + milliseconds,
  ).toISOString();
}

function createScanOwnerMessage(options: {
  correlationId: string;
  cursor: number;
  mode: SyncMode;
  owner: string;
  runId: string;
  scheduledAt: string;
}): ScanOwnerQueueMessage {
  return {
    correlationId: options.correlationId,
    cursor: options.cursor,
    kind: "scan-owner",
    mode: options.mode,
    owner: options.owner,
    runId: options.runId,
    schemaVersion: 1,
    scheduledAt: options.scheduledAt,
  };
}

export function shouldUseQueueBackedSync(env: AppEnv): boolean {
  return (
    env.QUEUE_SYNC_ENABLED === "true" &&
    Boolean(env.OWNER_QUEUE) &&
    Boolean(env.REPO_QUEUE)
  );
}

function getQueueForMessage(env: AppEnv, message: QueueMessageBody) {
  if (message.kind === "scan-owner") {
    return env.OWNER_QUEUE;
  }

  return env.REPO_QUEUE;
}

async function reenqueueDueDeferredJobs(options: {
  db: ReturnType<typeof createDb>;
  env: AppEnv;
  now: string;
}): Promise<number> {
  const dueJobs = await listDueDeferredSyncRunJobs(options.db, options.now);
  let requeuedCount = 0;

  for (const job of dueJobs) {
    const message = parseQueueMessage(JSON.parse(job.payloadJson) as unknown);
    const queue = getQueueForMessage(options.env, message);

    if (!queue) {
      throw new Error(`No queue binding for deferred job kind ${message.kind}`);
    }

    await requeueSyncRunJob(options.db, { id: job.id, queuedAt: options.now });
    await queue.send(message);
    requeuedCount += 1;
  }

  return requeuedCount;
}

export async function planScheduledQueueSync(options: {
  cron: string;
  env: AppEnv;
  mode: SyncMode;
  scheduledAt?: number;
  teamMembers?: TeamMember[];
}): Promise<SyncSummary> {
  const ownerQueue = options.env.OWNER_QUEUE;

  if (!ownerQueue) {
    throw new Error("OWNER_QUEUE binding is required for queue-backed sync");
  }

  const db = createDb(options.env.DB);
  const scheduledAt = new Date(options.scheduledAt ?? Date.now()).toISOString();
  const planningKey = createPlanningKey({
    cron: options.cron,
    mode: options.mode,
    scheduledAt,
  });
  const existingRun = await getSyncRunByPlanningKey(db, planningKey);

  if (existingRun) {
    return createEmptyQueueSummary();
  }

  const correlationId = createCorrelationId({
    cron: options.cron,
    mode: options.mode,
    scheduledAt,
  });
  const lockAcquired = await acquireSyncPlannerLock(db, {
    acquiredAt: scheduledAt,
    correlationId,
    expiresAt: addMilliseconds(scheduledAt, PLANNER_LOCK_DURATION_MS),
    name: PLANNER_LOCK_NAME,
    runId: planningKey,
  });

  if (!lockAcquired) {
    return createEmptyQueueSummary();
  }

  try {
    const requeuedDeferredJobs = await reenqueueDueDeferredJobs({
      db,
      env: options.env,
      now: scheduledAt,
    });
    const teamMembers = options.teamMembers ?? TEAM_MEMBERS;
    const rotatedMembers = rotateValues(teamMembers, 0);
    const runId = String(
      await insertSyncRun(db, {
        cron: options.cron,
        durationMs: 0,
        errorMessage: null,
        executionPath: "queue",
        finishedAt: scheduledAt,
        lastCheckpointJson: null,
        mode: options.mode,
        plannedOwnerCount: rotatedMembers.length,
        plannedRepoCount: 0,
        planningKey,
        processedOwnerCount: 0,
        processedRepoCount: 0,
        rateLimitSnapshotJson: null,
        rateLimitedUntil: null,
        reposDeferredByRateLimit: 0,
        startedAt: scheduledAt,
        status: "queued",
        summaryJson: JSON.stringify(createEmptyQueueSummary()),
      }),
    );

    await insertSyncRunPhase(db, {
      finishedAt: scheduledAt,
      phase: "plan",
      runId,
      startedAt: scheduledAt,
      status: "succeeded",
      summaryJson: JSON.stringify({ ownerJobs: rotatedMembers.length }),
    });
    await insertSyncRunPhase(db, {
      phase: "owner_scan",
      runId,
      status: rotatedMembers.length > 0 ? "pending" : "succeeded",
      summaryJson: JSON.stringify({ ownerJobs: rotatedMembers.length }),
    });

    for (const [cursor, member] of rotatedMembers.entries()) {
      const message = createScanOwnerMessage({
        correlationId,
        cursor: getNextOwnerCursor({
          currentCursor: 0,
          ownersProcessed: cursor,
          teamCount: rotatedMembers.length,
        }),
        mode: options.mode,
        owner: member.login,
        runId,
        scheduledAt,
      });
      const { created } = await upsertSyncRunJob(db, {
        message,
        queuedAt: scheduledAt,
      });

      if (created) {
        await ownerQueue.send(message);
      }
    }

    console.log(
      JSON.stringify({
        correlationId,
        event: "queue.planner",
        mode: options.mode,
        ownerJobs: rotatedMembers.length,
        requeuedDeferredJobs,
        runId,
      }),
    );

    return createEmptyQueueSummary();
  } finally {
    await releaseSyncPlannerLock(db, PLANNER_LOCK_NAME);
  }
}
