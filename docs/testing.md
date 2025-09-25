# Testing Strategies

`@macrofx/testing` provides lightweight fakes that help you exercise pipelines
without hitting real infrastructure. Combine them with bespoke env factories to
keep tests deterministic.

## Logger capture

```ts
import { execute, type Meta, type Step } from "@macrofx/core";
import { stdMacros } from "@macrofx/std";
import { fakeLogger } from "@macrofx/testing";

const { logs, logger } = fakeLogger();

const store = new Map<string, unknown>();

const testEnv = {
  makeKv: () => ({
    async get<T>(key: string) {
      return (store.get(key) ?? null) as T | null;
    },
    async set<T>(key: string, value: T) {
      store.set(key, value);
    },
    async del(key: string) {
      store.delete(key);
    },
  }),
  makeLogger: () => logger,
};

const step: Step<Meta, { tenantId: string }, string, symbol> = {
  name: "cache",
  meta: { kv: { namespace: "tests" }, log: { level: "debug" } },
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
};

await execute(step, {
  base: { tenantId: "green" },
  macros: stdMacros as any,
  env: testEnv,
});
```

- `fakeLogger()` captures every log call in the `logs` array for straightforward
  assertions.
- Supply only the host factories needed for the macros you enable. With the meta
  above, only `makeKv` and `makeLogger` are required.

## Deterministic capability fakes

- Wrap plain objects to satisfy port interfaces (`HttpPort`, `KvPort`, …). No
  inheritance is needed; returning functions is enough.
- Use closures to control failure modes (e.g. count how many times a method
  runs, throw after N invocations, inject latency).
- Keep stores (`Map`, arrays) at the env level so data persists across multiple
  `execute` calls in your test.

## Assertion tips

- Prefer `logs.some(...)` over positional checks – macro ordering may change,
  but semantic checks remain stable.
- Inspect resource usage by swapping `lease.*` implementations with fakes that
  record `acquire`/`release` pairs.
- Avoid relying on private sentinel fields (`__macrofxSkip`) in tests; assert on
  externally observable behaviour (outputs, logged messages, store contents).

See
[`examples/testing/with-fakes.test.ts`](./../examples/testing/with-fakes.test.ts)
for a runnable, self-contained reference.
