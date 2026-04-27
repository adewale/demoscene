import type { AppEnv, SyncMode, SyncSummary } from "./domain";
import { createDb } from "./db/client";
import { insertSyncRun } from "./db/queries";
import { syncRepositories } from "./sync";

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
  env: AppEnv;
  errorMessage: string | null;
  finishedAt: string;
  mode: SyncMode;
  startedAt: string;
  status: "failed" | "succeeded";
  summary: SyncSummary | null;
}) {
  await insertSyncRun(createDb(options.env.DB), {
    cron: options.cron,
    errorMessage: options.errorMessage,
    finishedAt: options.finishedAt,
    mode: options.mode,
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
    const summary = await syncRepositories(options.env, { mode });
    const finishedAt = new Date().toISOString();

    await recordSyncRun({
      cron: options.cron,
      env: options.env,
      errorMessage: null,
      finishedAt,
      mode,
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
      env: options.env,
      errorMessage,
      finishedAt,
      mode,
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
