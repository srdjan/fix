import { defineStep, type Meta } from "../../packages/core/mod.ts";
import { createStdEngine } from "../../packages/std/mod.ts";

/**
 * Demonstrates nested resource leases co-existing (lock + db + tempDir) and
 * bracket finalizers protecting staged artifacts.
 */

type Base = { tenantId: string };

type MultiResourceOut = {
  user: { id: string; name: string } | null;
  artifacts: string[];
};

const step = defineStep<Base, symbol>()({
  name: "multi-resource-sync",
  meta: {
    db: { role: "rw" },
    kv: { namespace: "users" },
    fs: { tempDir: true },
    lock: { mode: "exclusive" },
    retry: { times: 2, delayMs: 25 },
    timeout: { ms: 750, acquireMs: 500 },
    log: { level: "info" },
  } satisfies Meta,
  async run({ bracket, lease, kv, log, tenantId }) {
    const cacheKey = `user:${tenantId}`;
    const cached = await kv.get<{ id: string; name: string }>(cacheKey);
    if (cached) {
      log.info("cache.hit", { tenantId });
      return { user: cached, artifacts: [] };
    }

    return await bracket(
      () => lease.lock(`sync:${tenantId}`, "exclusive"),
      async () => {
        log.info("lock.acquired", { tenantId });

        return await bracket(
          () => lease.tempDir(`macrofx-${tenantId}-`),
          async ({ path }: { path: string }) => {
            const artifacts: string[] = [];
            artifacts.push(path);

            // optional finalizer to flush metrics even if tx fails
            const writeArtifact = async (name: string) => {
              artifacts.push(`${path}/${name}`);
            };

            const user = await lease.tx(async (db) => {
              const [row] = await db.query<{ id: string; name: string }>(
                "select id, name from users where id = $1",
                [tenantId],
              );
              await writeArtifact("query.json");
              return row ?? null;
            });

            if (user) {
              await kv.set(cacheKey, user, 5 * 60_000);
            }

            return { user, artifacts };
          },
          async () => {
            log.info("temp.cleanup", { tenantId });
          },
        );
      },
    );
  },
});

const base: Base = { tenantId: "123" };

const engine = createStdEngine<Base>();
const result = await engine.run(step, base);

console.log("multi-resource result", result);
