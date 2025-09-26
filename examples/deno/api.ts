// Deno demo: we simulate an endpoint that fetches a user (db) and caches it (kv),
// with retry + timeout + logging + tempDir resource.

import { defineStep, type Meta } from "../../packages/core/mod.ts";
import { createStdEngine } from "../../packages/std/engine.ts";

type Base = { requestId: string; userId: string };

const step = defineStep<Base>()({
  name: "get-user",
  meta: {
    db: { role: "ro" },
    kv: { namespace: "users" },
    http: { baseUrl: "http://localhost" }, // unused; here just to show type gating
    fs: { tempDir: true },
    retry: { times: 2, delayMs: 50 },
    timeout: { ms: 500, acquireMs: 2000 },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ kv, lease, bracket, userId, log }) {
    const cacheKey = `user:${userId}`;
    const hit = await kv.get<{ id: string; name: string }>(cacheKey);
    if (hit) {
      log.info("cache.hit", { cacheKey });
      return hit;
    }

    // use a temp dir safely; released after fn completes
    await bracket(
      () => lease.tempDir("example-"),
      async ({ path }: { path: string }) => {
        log.debug("temp.path", { path });
        await Promise.resolve();
      },
    );

    // pretend DB read
    const row = { id: userId, name: "Ada" };
    await kv.set(cacheKey, row, 60_000);
    return row;
  },
});

const base: Base = { requestId: crypto.randomUUID(), userId: "123" };

const engine = createStdEngine<Base>({} as any);
const out = await engine.run(step, base);

console.log("GET /users/123 →", out);
