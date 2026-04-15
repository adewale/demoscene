/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/triple-slash-reference */
/// <reference path="../../node_modules/@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts" />

import type { AppEnv } from "../../src/domain";

declare module "cloudflare:test" {
  interface ProvidedEnv extends AppEnv {}
}
