import { defineStep, execute } from "../../packages/core/mod.ts";
import { extendMeta, mergeMeta, meta } from "../../packages/core/meta-builder.ts";
import { stdMacros } from "../../packages/std/mod.ts";
import { hostNodeEnv } from "../../packages/host-node/mod.ts";

type Base = { userId: string };

console.log("\n=== Meta Composition Examples ===\n");

const baseMeta = meta()
  .withLog("info")
  .withRetry(3, 100)
  .build();

console.log("Base meta:", baseMeta);

const dbMeta = meta()
  .withDb("ro")
  .withKv("cache")
  .build();

console.log("DB meta:", dbMeta);

const combinedMeta = mergeMeta(baseMeta, dbMeta);

console.log("Merged meta:", combinedMeta);

const step = defineStep<Base>()({
  name: "composed-meta-step",
  meta: combinedMeta,
  async run({ userId, kv, log }) {
    log.info("running.with.composed.meta", { userId });
    await kv.set(`key:${userId}`, { timestamp: Date.now() });
    return { success: true };
  },
});

console.log("\n=== Executing with Composed Meta ===\n");

const result = await execute(step, {
  base: { userId: "comp-123" },
  macros: stdMacros as any,
  env: hostNodeEnv,
});

console.log("Result:", result);

console.log("\n=== Extending Meta ===\n");

const readOnlyMeta = meta()
  .withDb("ro")
  .withLog("debug")
  .build();

const writeMeta = extendMeta(readOnlyMeta, {
  kv: { namespace: "writes" },
  timeout: { ms: 2000 },
});

console.log("Extended meta:", writeMeta);

console.log("\n=== Reusable Meta Patterns ===\n");

const observableMeta = meta()
  .withLog("debug")
  .withTimeout({ ms: 5000 })
  .build();

const cachedMeta = meta()
  .withKv("cache")
  .build();

const resilientMeta = meta()
  .withRetry(3, 200, true)
  .withCircuit("default", 30000)
  .build();

const fullStack = mergeMeta(
  mergeMeta(observableMeta, cachedMeta),
  resilientMeta,
);

console.log("Full stack meta:", JSON.stringify(fullStack, null, 2));