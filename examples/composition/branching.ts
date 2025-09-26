import { defineStep, execute } from "../../packages/core/mod.ts";
import { branch } from "../../packages/core/compose.ts";
import { P } from "ts-pattern";
import { stdMacros } from "../../packages/std/mod.ts";
import { hostNodeEnv } from "../../packages/host-node/mod.ts";
import type { Meta } from "../../packages/core/types.ts";

type Base = { userId: string; plan: "free" | "pro" | "enterprise" };

const freeTierStep = defineStep<Base>()({
  name: "handle-free-tier",
  meta: {
    log: { level: "info" },
  } satisfies Meta,
  async run({ userId, log }) {
    log.info("handling.free.tier", { userId });
    return { limits: { apiCalls: 100, storage: "1GB" } };
  },
});

const proTierStep = defineStep<Base>()({
  name: "handle-pro-tier",
  meta: {
    log: { level: "info" },
    kv: { namespace: "pro-users" },
  } satisfies Meta,
  async run({ userId, kv, log }) {
    log.info("handling.pro.tier", { userId });
    await kv.set(`pro:${userId}`, { upgraded: Date.now() });
    return { limits: { apiCalls: 10000, storage: "100GB" } };
  },
});

const enterpriseTierStep = defineStep<Base>()({
  name: "handle-enterprise-tier",
  meta: {
    log: { level: "info" },
    db: { role: "rw" },
    kv: { namespace: "enterprise-users" },
  } satisfies Meta,
  async run({ userId, kv, log }) {
    log.info("handling.enterprise.tier", { userId });
    await kv.set(`enterprise:${userId}`, { upgraded: Date.now() });
    return { limits: { apiCalls: -1, storage: "unlimited" } };
  },
});

console.log("\n=== Running Branching Example (Free) ===\n");

const freePlan = { userId: "user1", plan: "free" as const };
const freeStep = branch<"free" | "pro" | "enterprise", Base>(freePlan.plan)
  .with("free", freeTierStep)
  .with("pro", proTierStep)
  .otherwise(enterpriseTierStep);

const freeResult = await execute(freeStep, {
  base: freePlan,
  macros: stdMacros as any,
  env: hostNodeEnv,
});

console.log("Free tier result:", freeResult);

console.log("\n=== Running Branching Example (Pro) ===\n");

const proPlan = { userId: "user2", plan: "pro" as const };
const proStep = branch<"free" | "pro" | "enterprise", Base>(proPlan.plan)
  .with("free", freeTierStep)
  .with("pro", proTierStep)
  .otherwise(enterpriseTierStep);

const proResult = await execute(proStep, {
  base: proPlan,
  macros: stdMacros as any,
  env: hostNodeEnv,
});

console.log("Pro tier result:", proResult);

console.log("\n=== Running Branching Example (Enterprise) ===\n");

const enterprisePlan = { userId: "user3", plan: "enterprise" as const };
const enterpriseStep = branch<"free" | "pro" | "enterprise", Base>(
  enterprisePlan.plan,
)
  .with("free", freeTierStep)
  .with("pro", proTierStep)
  .otherwise(enterpriseTierStep);

const enterpriseResult = await execute(enterpriseStep, {
  base: enterprisePlan,
  macros: stdMacros as any,
  env: hostNodeEnv,
});

console.log("Enterprise tier result:", enterpriseResult);