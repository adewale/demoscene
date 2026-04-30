import type { AppEnv } from "../domain";
import { createDb } from "../db/client";
import {
  markSyncRunJobDeferred,
  markSyncRunJobFailed,
  markSyncRunJobProcessing,
  markSyncRunJobSucceeded,
  upsertSyncRunJob,
} from "../db/queries";
import {
  buildQueueJobId,
  parseQueueMessage,
  type QueueMessageBody,
} from "../lib/queue/messages";
import { scanOwnerForQueue, syncQueuedRepository } from "../sync";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getErrorStage(message: QueueMessageBody | null): string {
  if (!message) {
    return "parse";
  }

  if (message.kind === "scan-owner") {
    return "owner_scan";
  }

  if (message.kind === "sync-repo") {
    return "repo_sync";
  }

  return "verify_missing";
}

function createRepoMessage(options: {
  correlationId: string;
  kind: "sync-repo" | "verify-missing-repo";
  mode: QueueMessageBody["mode"];
  owner: string;
  repo: string;
  repoUrl: string;
  runId: string;
  timestamp: string;
}): QueueMessageBody {
  if (options.kind === "sync-repo") {
    return {
      correlationId: options.correlationId,
      discoveredAt: options.timestamp,
      kind: options.kind,
      mode: options.mode,
      owner: options.owner,
      repo: options.repo,
      repoUrl: options.repoUrl,
      runId: options.runId,
      schemaVersion: 1,
    };
  }

  return {
    correlationId: options.correlationId,
    kind: options.kind,
    mode: options.mode,
    owner: options.owner,
    repo: options.repo,
    repoUrl: options.repoUrl,
    runId: options.runId,
    schemaVersion: 1,
  };
}

async function enqueueRepoMessages(options: {
  correlationId: string;
  db: ReturnType<typeof createDb>;
  kind: "sync-repo" | "verify-missing-repo";
  mode: QueueMessageBody["mode"];
  queue: Queue<unknown>;
  repositories: Array<{ owner: string; repo: string; repoUrl: string }>;
  runId: string;
  timestamp: string;
}): Promise<void> {
  for (const repository of options.repositories) {
    const repoMessage = createRepoMessage({
      correlationId: options.correlationId,
      kind: options.kind,
      mode: options.mode,
      owner: repository.owner,
      repo: repository.repo,
      repoUrl: repository.repoUrl,
      runId: options.runId,
      timestamp: options.timestamp,
    });
    const { created } = await upsertSyncRunJob(options.db, {
      message: repoMessage,
      queuedAt: options.timestamp,
    });

    if (created) {
      await options.queue.send(repoMessage);
    }
  }
}

export async function processQueueBatch(
  batch: MessageBatch<unknown>,
  env: AppEnv,
  options: { fetch?: typeof fetch; now?: Date } = {},
): Promise<void> {
  const db = createDb(env.DB);

  for (const queueMessage of batch.messages) {
    let jobId: string | null = null;
    let message: QueueMessageBody | null = null;

    try {
      message = parseQueueMessage(queueMessage.body);
      jobId = buildQueueJobId(message);
      const startedAt = new Date().toISOString();

      await markSyncRunJobProcessing(db, jobId, startedAt);

      if (message.kind === "scan-owner") {
        const repoQueue = env.REPO_QUEUE;

        if (!repoQueue) {
          throw new Error("REPO_QUEUE binding is required for owner scans");
        }

        const scan = await scanOwnerForQueue(env, {
          fetch: options.fetch,
          mode: message.mode,
          now: options.now,
          owner: message.owner,
        });
        const finishedAt = new Date().toISOString();

        await enqueueRepoMessages({
          correlationId: message.correlationId,
          db,
          kind: "sync-repo",
          mode: message.mode,
          queue: repoQueue,
          repositories: scan.repositoriesToSync,
          runId: message.runId,
          timestamp: finishedAt,
        });
        await enqueueRepoMessages({
          correlationId: message.correlationId,
          db,
          kind: "verify-missing-repo",
          mode: message.mode,
          queue: repoQueue,
          repositories: scan.repositoriesToVerifyMissing,
          runId: message.runId,
          timestamp: finishedAt,
        });

        if (scan.rateLimitedUntil) {
          await markSyncRunJobDeferred(db, {
            finishedAt,
            id: jobId,
            rateLimitedUntil: scan.rateLimitedUntil,
          });
        } else if (scan.summary.accountsFailed > 0) {
          throw new Error(`Owner scan failed for ${message.owner}`);
        } else {
          await markSyncRunJobSucceeded(db, jobId, finishedAt);
        }

        queueMessage.ack();
        continue;
      }

      const result = await syncQueuedRepository(env, {
        fetch: options.fetch,
        now: options.now,
        repoUrl: message.repoUrl,
      });
      const finishedAt = new Date().toISOString();

      if (result.outcome === "deferred_by_rate_limit") {
        await markSyncRunJobDeferred(db, {
          finishedAt,
          id: jobId,
          rateLimitedUntil: result.retryAfter ?? null,
        });
      } else {
        await markSyncRunJobSucceeded(db, jobId, finishedAt);
      }

      queueMessage.ack();
    } catch (error) {
      const finishedAt = new Date().toISOString();

      if (jobId) {
        await markSyncRunJobFailed(db, {
          errorKind: "consumer_error",
          errorMessage: getErrorMessage(error),
          errorStage: getErrorStage(message),
          finishedAt,
          id: jobId,
        });
      }

      console.error(
        JSON.stringify({
          error: getErrorMessage(error),
          event: "queue.consumer.error",
          jobId,
        }),
      );
      queueMessage.retry();
    }
  }
}
