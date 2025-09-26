# Testing Strategies

`@macrofx/testing` provides lightweight fakes that help you exercise pipelines
without hitting real infrastructure. Combine them with bespoke env factories to
keep tests deterministic.

## Logger capture

```ts
import { createEngine, defineStep } from "@macrofx/core";
import { stdMacros } from "@macrofx/std";
import { fakeKv, fakeLogger } from "@macrofx/testing";

const { logs, logger } = fakeLogger();
const { port: kv } = fakeKv();

const testEnv = {
  makeKv: () => kv,
  makeLogger: () => logger,
};

const cacheStep = defineStep<{ tenantId: string }>()({
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
});

const engine = createEngine<{ tenantId: string }>({
  macros: stdMacros as any,
  env: testEnv,
});

await engine.run(cacheStep, { tenantId: "green" });
```

- `fakeLogger()` captures every log call in the `logs` array for straightforward
  assertions.
- `fakeKv()` returns a deterministic in-memory KV along with the underlying
  store for white-box checks.
- Supply only the host factories needed for the macros you enable. With the meta
  above, only `makeKv` and `makeLogger` are required.

## Deterministic capability fakes

- Use `fakeHttp()` to stub HTTP ports with per-route handlers and inspect call
  history; return plain objects to respond with JSON.
- `fakeTime()` gives you a clock whose `sleep` simply advances internal time —
  perfect for timeout and retry tests.
- Wrap any port with `withChaos(port, { failRate })` to simulate transient
  failures or latency spikes without touching production code.
- Keep stores (`Map`, arrays) at the env level so data persists across multiple
  engine runs in your test.

## Assertion tips

- Prefer `logs.some(...)` over positional checks – macro ordering may change,
  but semantic checks remain stable.
- Inspect resource usage by swapping `lease.*` implementations with fakes that
  record `acquire`/`release` pairs.
- Avoid relying on private sentinel fields — prefer the exported helpers (e.g.
  `setMacroResult`) or assert on externally observable behaviour (outputs,
  logged messages, store contents).

See
[`examples/testing/with-fakes.test.ts`](./../examples/testing/with-fakes.test.ts)
for a runnable, self-contained reference.
