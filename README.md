# macrofx-unified

**A unified, type-safe, metadata-driven pipeline for capabilities (effects)
_and_ resources (leases) in modern TypeScript.**\
No classes, no decorators — just functions, types, and a tiny executor with six
phases:

```
validate → resolve → before → run → onError → after
```

This monorepo combines three ideas under one engine:

- **macrofx (capability injection):** declare what you need in `meta`; get typed
  ports in `ctx`.
- **effectfx (side-effects):** HTTP, KV, DB, Queue, Time, Crypto, Log as
  **Ports**, host-agnostic.
- **resourcefx (lifetimes):** **bracket** + **Lease<T, Scope>** to guarantee
  allocation/release without leaks.

> You only see the capabilities you declare in `meta`. The compiler enforces
> this at call sites.

---

## Quick start (Deno)

Requirements: Deno 2+

```bash
deno task demo
```

You should see:

```
GET /users/123 → { id: "123", name: "Ada" }
```

## Monorepo layout

```
macrofx-unified/
  packages/
    core/           # executor, types, policy weaver
    ports/          # type-only port surfaces
    std/            # built-in macros & policies (http/kv/db + retry/timeout/log/idempotency)
    resources/      # bracket + Lease<T,Scope> + temp dir + simple pool
    host-node/      # Node-compatible host bindings (fetch, crypto, fs, in-memory kv/db)
    testing/        # fakes, chaos, leak detection helpers
  examples/
    deno/           # Deno.serve demo endpoint
  docs/             # comprehensive documentation
  deno.json         # tasks
```

## Why unify?

- **One `meta`, one `CapsOf<M>`** for both effects and resources.
- **One policy weaver** applies `retry/timeout/idempotency/log` uniformly across
  all ports/openers.
- **Host-agnostic**: swap `host-node` (Node), `host-deno` (Deno, not required
  for the demo), or write your own.
- **Testable**: pass `@macrofx/testing` fakes into the executor; everything is
  functions.

## Key Features

### 🔧 Ergonomic Meta Builder

Build meta declaratively with type-safe chaining:

```typescript
import { meta } from "@macrofx/core";

const myMeta = meta()
  .withDb("ro")
  .withKv("users")
  .withRetry(3, 100, true)
  .withTimeout({ ms: 5000 })
  .withLog("debug")
  .build();
```

### 🔄 Step Composition

Compose steps into pipelines, parallel execution, and branches:

```typescript
import { pipe, allSteps, race, branch } from "@macrofx/core";

// Sequential pipeline
const pipeline = pipe<Base>()(fetchUser, enrichProfile, cacheResult);

// Parallel execution
const parallel = allSteps<Base>()(fetchData, fetchOrders, fetchRecs);

// Pattern-matched branching with ts-pattern
const tiered = branch<"free" | "pro" | "enterprise", Base>(plan)
  .with("free", freeTierStep)
  .with("pro", proTierStep)
  .otherwise(enterpriseTierStep);
```

### ✅ Result Type for Error Handling

Type-safe error handling without exceptions:

```typescript
import { ok, err, map, matchResult, withResult, type Result } from "@macrofx/core";

const safeStep = withResult<Base>()(riskyStep);
const result = await execute(safeStep, config);

matchResult(
  result,
  (data) => console.log("Success:", data),
  (error) => console.error("Error:", error)
);
```

### 🎯 Enhanced Context Helpers

```typescript
async run(ctx) {
  // Telemetry spans
  return await ctx.span("fetch-user", async (ctx) => {
    return await ctx.kv.get(key);
  });

  // Request-scoped memoization
  const cached = await ctx.memo("expensive", () => compute());

  // Spawn child steps
  const result = await ctx.child({ http: { baseUrl: "..." } }, apiStep);
}
```

### 🛡️ Better Validation & Error Messages

```typescript
import { validateStep, assertValidStep } from "@macrofx/core";

// Helpful errors with suggestions
// [UNKNOWN_CAPABILITY] Step declares 'redis' but no matching macro registered
// 💡 Did you mean 'kv'? Add the corresponding macro to your macros array
```

## Examples

### Core Examples
- `examples/deno/api.ts` — HTTP-like example with cache + db + retry + timeout
- `examples/advanced/multi-resource.ts` — Nested leases with finalisers
- `examples/advanced/policy-combo.ts` — Retry + timeout + circuit breaker
- `examples/testing/with-fakes.test.ts` — Using `@macrofx/testing` fakes

### New Ergonomic Examples
- `examples/composition/pipeline.ts` — Sequential pipeline with `pipe()`
- `examples/composition/parallel.ts` — Parallel execution with `allSteps()`
- `examples/composition/branching.ts` — Pattern-matched branching with ts-pattern
- `examples/result-based/error-handling.ts` — Result type with steps
- `examples/result-based/chaining.ts` — Result combinators
- `examples/builder/fluent-meta.ts` — Meta builder usage
- `examples/builder/meta-composition.ts` — Composing meta objects

## Testing helpers

- `fakeLogger()` captures structured logs for assertions
- `fakeKv()` / `fakeHttp()` / `fakeTime()` provide deterministic ports
- `withChaos()` wraps ports with configurable failure/latency injection
- `createPolicyTracker()` tracks and asserts on policy execution
- `snapshotPort()` records all port interactions for testing

## Documentation

- [Overview](./docs/overview.md) - High-level concepts and architecture
- [Concepts](./docs/concepts.md) - Core terminology and patterns
- [API Reference](./docs/api.md) - Detailed API documentation
- [Architecture](./docs/architecture.md) - System design and execution flow
- [Testing Guide](./docs/testing.md) - Testing strategies and utilities
- [Policies](./docs/policies.md) - Policy configuration and composition
- [Examples Guide](./docs/examples.md) - Detailed example walkthroughs
- [Ergonomic Enhancements](./docs/ergonomic-enhancements.md) - New features guide

## Publishing strategy

- Keep code here as a mono-source of truth.
- Publish packages as: `@macrofx/core`, `@macrofx/std`, `@macrofx/ports`,
  `@macrofx/resources`, `@macrofx/host-node`, `@macrofx/testing`.

## License

MIT — see [LICENSE](./LICENSE).
