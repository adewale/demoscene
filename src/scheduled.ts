import type { AppEnv, SyncMode, SyncSummary } from "./domain";
import { createDb } from "./db/client";
import { insertSyncRun } from "./db/queries";
import { syncRepositoriesWithTelemetry } from "./sync";

const WEEKLY_RECONCILE_CRON = "17 3 * * SUN";

function getScheduledSyncMode(cron: string): SyncMode {
  if (cron === WEEKLY_RECONCILE_CRON) {
    return "reconcile";
  }

  return "incremental";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function recordSyncRun(options: {
  cron: string;
  durationMs: number;
  env: AppEnv;
  errorMessage: string | null;
  finishedAt: string;
  lastCheckpointJson: string | null;
  mode: SyncMode;
  plannedOwnerCount: number;
  plannedRepoCount: number;
  processedOwnerCount: number;
  processedRepoCount: number;
  rateLimitSnapshotJson: string | null;
  rateLimitedUntil: string | null;
  reposDeferredByRateLimit: number;
  startedAt: string;
  status: "failed" | "succeeded";
  summary: SyncSummary | null;
}) {
  await insertSyncRun(createDb(options.env.DB), {
    cron: options.cron,
    durationMs: options.durationMs,
    errorMessage: options.errorMessage,
    finishedAt: options.finishedAt,
    lastCheckpointJson: options.lastCheckpointJson,
    mode: options.mode,
    plannedOwnerCount: options.plannedOwnerCount,
    plannedRepoCount: options.plannedRepoCount,
    processedOwnerCount: options.processedOwnerCount,
    processedRepoCount: options.processedRepoCount,
    rateLimitSnapshotJson: options.rateLimitSnapshotJson,
    rateLimitedUntil: options.rateLimitedUntil,
    reposDeferredByRateLimit: options.reposDeferredByRateLimit,
    startedAt: options.startedAt,
    status: options.status,
    summaryJson: options.summary ? JSON.stringify(options.summary) : null,
  });
}

export async function runScheduledSync(options: {
  cron: string;
  env: AppEnv;
}): Promise<SyncSummary> {
  const mode = getScheduledSyncMode(options.cron);
  const startedAt = new Date().toISOString();

  try {
    const { summary, telemetry } = await syncRepositoriesWithTelemetry(
      options.env,
      { mode },
    );
    const finishedAt = new Date().toISOString();

    await recordSyncRun({
      cron: options.cron,
      durationMs: telemetry.durationMs,
      env: options.env,
      errorMessage: null,
      finishedAt,
      lastCheckpointJson: telemetry.lastCheckpoint
        ? JSON.stringify(telemetry.lastCheckpoint)
        : null,
      mode,
      plannedOwnerCount: telemetry.plannedOwnerCount,
      plannedRepoCount: telemetry.plannedRepoCount,
      processedOwnerCount: telemetry.processedOwnerCount,
      processedRepoCount: telemetry.processedRepoCount,
      rateLimitSnapshotJson: telemetry.rateLimitSnapshot
        ? JSON.stringify(telemetry.rateLimitSnapshot)
        : null,
      rateLimitedUntil: telemetry.rateLimitSnapshot?.rateLimitedUntil ?? null,
      reposDeferredByRateLimit:
        telemetry.rateLimitSnapshot?.reposDeferredByRateLimit ?? 0,
      startedAt,
      status: "succeeded",
      summary,
    });

    console.log(
      JSON.stringify({
        event: "sync.summary",
        cron: options.cron,
        mode,
        ...summary,
      }),
    );

    return summary;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorMessage = getErrorMessage(error);

    await recordSyncRun({
      cron: options.cron,
      durationMs: Math.max(0, Date.now() - new Date(startedAt).valueOf()),
      env: options.env,
      errorMessage,
      finishedAt,
      lastCheckpointJson: null,
      mode,
      plannedOwnerCount: 0,
      plannedRepoCount: 0,
      processedOwnerCount: 0,
      processedRepoCount: 0,
      rateLimitSnapshotJson: null,
      rateLimitedUntil: null,
      reposDeferredByRateLimit: 0,
      startedAt,
      status: "failed",
      summary: null,
    });

    console.error(
      JSON.stringify({
        cron: options.cron,
        error: errorMessage,
        event: "sync.error",
        mode,
      }),
    );

    throw error;
  }
}
