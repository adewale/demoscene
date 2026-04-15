import type { AppEnv } from "./domain";

import { createApp } from "./app";
import { syncRepositories } from "./sync";

const app = createApp();

export { app, syncRepositories };

export default {
  fetch: app.fetch,
  scheduled(
    _controller: ScheduledController,
    env: AppEnv,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(syncRepositories(env));
  },
};
