import { defineStep, execute } from "../../packages/core/mod.ts";
import { pipe } from "../../packages/core/compose.ts";
import { stdMacros } from "../../packages/std/mod.ts";
import { hostNodeEnv } from "../../packages/host-node/mod.ts";
import type { Meta } from "../../packages/core/types.ts";

type Base = { userId: string };

const fetchUser = defineStep<Base>()({
  name: "fetch-user",
  meta: {
    db: { role: "ro" },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ userId, log }) {
    log.info("fetching.user", { userId });
    return { id: userId, name: "Ada", email: "ada@example.com" };
  },
});

const enrichProfile = defineStep<Base>()({
  name: "enrich-profile",
  meta: {
    http: { baseUrl: "https://api.example.com" },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ log }) {
    log.info("enriching.profile");
    return { preferences: { theme: "dark" }, badges: ["contributor"] };
  },
});

const cacheResult = defineStep<Base>()({
  name: "cache-result",
  meta: {
    kv: { namespace: "profiles" },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ userId, kv, log }) {
    log.info("caching.result", { userId });
    await kv.set(`profile:${userId}`, { cached: true });
    return { success: true };
  },
});

const pipeline = pipe<Base>()(fetchUser, enrichProfile, cacheResult);

console.log("\n=== Running Pipeline Example ===\n");

const result = await execute(pipeline, {
  base: { userId: "123" },
  macros: stdMacros as any,
  env: hostNodeEnv,
});

console.log("Pipeline result:", result);