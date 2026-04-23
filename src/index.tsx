import type { AppEnv } from "./domain";

import { createApp } from "./app";
import { syncRepositories } from "./sync";

const app = createApp();
const DAILY_INCREMENTAL_CRON = "0 12 * * *";
const WEEKLY_RECONCILE_CRON = "17 3 * * SUN";

export { app, syncRepositories };

export default {
  fetch: app.fetch,
  scheduled(
    controller: ScheduledController,
    env: AppEnv,
    ctx: ExecutionContext,
  ) {
    const mode =
      controller.cron === WEEKLY_RECONCILE_CRON
        ? "reconcile"
        : controller.cron === DAILY_INCREMENTAL_CRON
          ? "incremental"
          : "incremental";

    ctx.waitUntil(
      syncRepositories(env, { mode }).then((summary) => {
        console.log(
          JSON.stringify({ event: "sync.summary", mode, ...summary }),
        );
      }),
    );
  },
};
