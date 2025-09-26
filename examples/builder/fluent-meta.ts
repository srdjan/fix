import { defineStep } from "../../packages/core/mod.ts";
import { meta } from "../../packages/core/meta-builder.ts";
import { createStdEngine } from "../../packages/std/mod.ts";

type Base = { userId: string };

console.log("\n=== Using Meta Builder (Fluent API) ===\n");

const oldStyleMeta = {
  db: { role: "ro" as const },
  kv: { namespace: "users" },
  retry: { times: 3, delayMs: 100 },
  timeout: { ms: 5000 },
  log: { level: "info" as const },
};

console.log("Old style meta:", oldStyleMeta);

const newStyleMeta = meta()
  .withDb("ro")
  .withKv("users")
  .withRetry(3, 100)
  .withTimeout({ ms: 5000 })
  .withLog("info");

console.log("New style meta:", newStyleMeta);

const step = defineStep<Base>()({
  name: "get-user-with-builder",
  meta: newStyleMeta,
  async run({ userId, kv, log }) {
    log.info("fetching.user", { userId });

    const cached = await kv.get<{ id: string; name: string }>(
      `user:${userId}`,
    );
    if (cached) {
      log.info("cache.hit", { userId });
      return cached;
    }

    const user = { id: userId, name: "Ada Lovelace" };
    await kv.set(`user:${userId}`, user, 60_000);
    return user;
  },
});

console.log("\n=== Executing Step with Builder Meta ===\n");

const engine = createStdEngine<Base>();
const result = await engine.run(step, { userId: "builder-123" });

console.log("Result:", result);

console.log("\n=== Complex Builder Example ===\n");

const complexMeta = meta()
  .withHttp("https://api.example.com")
  .withDb("rw")
  .withKv("sessions")
  .withQueue("notifications")
  .withCrypto({ uuid: true, hash: "sha256" })
  .withFs({ tempDir: true })
  .withRetry(5, 200, true)
  .withTimeout({ ms: 10000, acquireMs: 3000 })
  .withCircuit("api-calls", 60000)
  .withLog("debug");

console.log("Complex meta:", JSON.stringify(complexMeta, null, 2));
