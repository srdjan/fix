import {
  createEngine,
  defineStep,
  type Meta,
} from "../../packages/core/mod.ts";
import { stdMacros } from "../../packages/std/mod.ts";
import { fakeKv, fakeLogger } from "../../packages/testing/mod.ts";

const { logs, logger } = fakeLogger();
const { port: kvPort } = fakeKv();

const testEnv = {
  makeKv: () => kvPort,
  makeLogger: () => logger,
};

type Base = { tenantId: string };

const meta = {
  kv: { namespace: "tests" },
  log: { level: "debug" },
} as const satisfies Meta;

type StepMeta = typeof meta;

const cacheStep = defineStep<Base, symbol>()({
  name: "cache-write",
  meta,
  async run({ kv, log, tenantId }) {
    const key = `tenant:${tenantId}`;
    const cached = await kv.get<string>(key);
    if (cached) {
      log.info("cache.hit", { key });
      return cached;
    }
    log.info("cache.miss", { key });
    const value = `fresh:${tenantId}`;
    await kv.set(key, value);
    return value;
  },
});

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg ?? `Expected ${expected}, got ${actual}`);
  }
}

function assert(condition: unknown, msg: string) {
  if (!condition) {
    throw new Error(msg);
  }
}

Deno.test("cache hydration uses fake logger", async () => {
  const base: Base = { tenantId: "green" };

  const engine = createEngine<Base>({
    macros: stdMacros as any,
    env: testEnv,
  });

  const first = await engine.run(cacheStep, base);

  assertEquals(first, "fresh:green");

  const second = await engine.run(cacheStep, base);

  assertEquals(second, "fresh:green");

  assert(
    logs.some(([level, message]) =>
      level === "info" && message === "cache.hit"
    ),
    "expected cache.hit log entry",
  );
});
