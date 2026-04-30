import type { AppEnv } from "./domain";

import { createApp } from "./app";
import { processQueueBatch } from "./queue/consumer";
import { runScheduledSync } from "./scheduled";
import { syncRepositories } from "./sync";

const app = createApp();

export { app, syncRepositories };

export default {
  fetch: app.fetch,
  scheduled(
    controller: ScheduledController,
    env: AppEnv,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      runScheduledSync({
        cron: controller.cron,
        env,
        scheduledAt: controller.scheduledTime,
      }),
    );
  },
  queue(batch: MessageBatch<unknown>, env: AppEnv, ctx: ExecutionContext) {
    ctx.waitUntil(processQueueBatch(batch, env));
  },
};
