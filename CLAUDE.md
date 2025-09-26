# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Repository Overview

**macrofx-unified** is a type-safe, metadata-driven pipeline for effects and
resources in modern TypeScript/Deno. It unifies capability injection (macrofx),
side-effects (effectfx), and resource lifetimes (resourcefx) under one six-phase
executor: `validate → resolve → before → run → onError → after`.

## Common Development Commands

```bash
# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task typecheck

# Run demo (Deno.serve example with KV + DB + retry + timeout)
deno task demo

# Run all tests
deno task test

# Run tests for a specific file
deno test -A path/to/test.ts

# Run tests in watch mode
deno test -A --watch
```

## Architecture Overview

### Core Concepts

- **Meta**: Declarative metadata object that specifies what capabilities a step
  needs (e.g., `http`, `kv`, `db`, `retry`, `timeout`)
- **CapsOf<M, Scope>**: Type-level function that derives the exact capabilities
  object from meta, ensuring compile-time safety
- **Port**: Typed interface for effects (HttpPort, KvPort, DbPort, QueuePort,
  TimePort, CryptoPort, LogPort)
- **Lease<T, Scope>**: Branded resource handle that cannot escape its scope;
  managed via `bracket`
- **Bracket**: Combinator guaranteeing `acquire → use → release` lifecycle
  without leaks
- **Macro**: Plugin that matches meta, resolves ports/leases, and can run
  lifecycle hooks (before/after/onError)
- **Weaver**: Applies policies (circuit → log → retry → timeout) uniformly to
  all ports and lease acquires

### Package Structure

```
packages/
  core/           # executor, types, bracket, policy weaver
    executor.ts   # Six-phase execution engine
    types.ts      # Meta, CapsOf<M>, Step<M>, Macro<M>, ExecutionCtx<M>
    bracket.ts    # Resource lifecycle combinator
    weave.ts      # Policy decorator (retry/timeout/circuit/log)
    utils.ts      # sleep, withJitter, wrapMethods
  ports/          # Type-only port surfaces (HttpPort, KvPort, DbPort, etc.)
  std/            # Built-in macros (http/kv/db/fs/lock + retry/timeout/log/idempotency/circuit)
    macros.ts     # Default macro registry
  resources/      # bracket + Lease<T,Scope> + tempDir + simple pool
    pool.ts       # Generic resource pooling
    fs.ts         # Temporary directory lease implementation
  std/env.ts      # Default in-memory host bindings for demos/tests
  testing/        # Fakes, chaos injection, leak detection helpers
```

### Execution Flow

1. **Validate**: Check step structure
2. **Resolve**: Match macros against `meta`, resolve ports and lease openers
3. **Weave**: Apply policies (circuit breaker → logging → retry → timeout) to
   ports
4. **Before**: Run macro before-hooks (e.g., idempotency check)
5. **Run**: Execute `step.run(ctx)` with typed capabilities
6. **After/OnError**: Run cleanup hooks, handle errors

### Key Design Patterns

- **No classes or inheritance**: Pure functions and types
- **Type-gated capabilities**: Only declared capabilities appear in `ctx`;
  compiler enforces this
- **Declarative policies**: Add `retry`, `timeout`, `circuit`, `idempotency` in
  meta without touching business logic
- **Host-agnostic**: Extend `packages/std/env.ts` or supply your own factories
  for real hosts
- **Effect/resource unification**: One `meta`, one `CapsOf<M>`, one policy
  weaver for both

## Writing Steps

Use `defineStep<Base, Scope>()` to create type-safe steps:

```typescript
import { defineStep } from "@macrofx/core";
import { stdMacros } from "@macrofx/std";
import { createStdEngine } from "@macrofx/std";

type Base = { requestId: string; userId: string };

const step = defineStep<Base>()({
  name: "get-user",
  meta: {
    db: { role: "ro" },
    kv: { namespace: "users" },
    retry: { times: 2, delayMs: 50 },
    timeout: { ms: 500 },
    log: { level: "debug" },
  },
  async run({ kv, lease, bracket, userId, log }) {
    // Only declared capabilities (kv, lease, bracket, log) are available
    // TypeScript enforces this at compile time
  },
});

const engine = createStdEngine<Base>({ validate: true });
const result = await engine.run(step, { requestId: "123", userId: "456" });
```

## Testing

- **Unit tests**: Pure domain logic (no permissions needed)
- **Integration tests**: Use `@macrofx/testing` fakes
- **Chaos testing**: Use `withChaos()` wrapper to inject failures/latency

Example with fakes:

```typescript
import { createEngine } from "@macrofx/core";
import { fakeKv, fakeLogger } from "@macrofx/testing";

Deno.test("step with fakes", async () => {
  const kv = fakeKv();
  const log = fakeLogger();

  const engine = createEngine<{ userId: string }>({
    macros: stdMacros,
    env: { makeKv: () => kv, makeLogger: () => log },
  });

  const result = await engine.run(step, { userId: "test" });

  assertEquals(log.entries.length, 2);
});
```

## Policy Configuration

All policies are declared in `meta`:

- `retry: { times: number; delayMs: number; jitter?: boolean }` - Automatic
  retry with optional jitter
- `timeout: { ms?: number; acquireMs?: number }` - Timeouts for effects and
  resource acquisition
- `circuit: { name: string; halfOpenAfterMs?: number }` - Circuit breaker
  pattern
- `idempotency: { key: string; ttlMs?: number }` - Idempotency key checking
- `log: { level: "debug" | "info" | "warn" | "error" }` - Structured logging

Policies are applied in order: circuit → log → retry → timeout

## Resource Management

Use `bracket` for guaranteed cleanup:

```typescript
await bracket(
  () => lease.tempDir("prefix-"), // acquire
  async ({ path }) => { // use
    // work with temp directory
  },
  // release happens automatically
);
```

Leases are type-branded and scope-bound, preventing accidental resource leaks.

## Extending with Custom Macros

Create a macro to add new capabilities:

```typescript
import type { Macro } from "@macrofx/core";

const myMacro: Macro<Meta, { custom: CustomPort }> = {
  key: "custom",
  match: (m) => Boolean(m.custom),
  resolve: async (m, env) => ({
    custom: (env as any).makeCustom(m.custom),
  }),
};

// Add to macro registry
const macros = [...stdMacros, myMacro];
```

## Common Patterns

### Effect ports

- Accessed directly: `ctx.http`, `ctx.kv`, `ctx.db`, `ctx.queue`
- Automatically wrapped with policies from meta

### Resource leases

- Acquired via `ctx.lease.db()`, `ctx.lease.tempDir()`, `ctx.lease.lock()`
- Must be used with `ctx.bracket(acquire, use)` for guaranteed cleanup
- Type system prevents leases from escaping their scope

### Macro short-circuiting

- Use `setMacroResult(ctx, value)` in a before-hook to skip `run` phase
- Common for idempotency checks or cached responses

## New Ergonomic Features

### Result Type for Error Handling

Instead of throwing exceptions, steps can return `Result<T, E>`:

```typescript
import { err, flatMap, map, matchResult, ok, type Result } from "@macrofx/core";

type FetchError = "NOT_FOUND" | "TIMEOUT";

const fetchUser = (id: string): Result<User, FetchError> => {
  if (id === "missing") return err("NOT_FOUND");
  return ok({ id, name: "Ada" });
};

const result = fetchUser("123");
matchResult(
  result,
  (user) => console.log("Success:", user),
  (error) => console.error("Error:", error),
);

// Compose with map/flatMap
const transformed = map(result, (user) => ({ ...user, active: true }));
```

Wrap steps to return Result instead of throwing:

```typescript
import { withResult } from "@macrofx/core";
import { createStdEngine } from "@macrofx/std";

const engine = createStdEngine<Base>();
const safeStep = withResult<Base>()(riskyStep);
const result = await engine.run(safeStep, base); // Returns Result<Out, Error>
```

### Meta Builder (Fluent API)

Build meta declaratively with type-safe chaining:

```typescript
import { meta } from "@macrofx/core";

const myMeta = meta()
  .withDb("ro")
  .withKv("users")
  .withRetry(3, 100, true) // times, delayMs, jitter
  .withTimeout({ ms: 5000, acquireMs: 2000 })
  .withLog("debug");

// Compose meta objects
import { extendMeta, mergeMeta } from "@macrofx/core";

const baseMeta = meta().withLog("info").withRetry(3, 100);
const dbMeta = meta().withDb("ro").withKv("cache");
const combined = mergeMeta(baseMeta.build(), dbMeta.build());
```

### Step Composition

Compose steps into pipelines, parallel execution, and branches:

```typescript
import { all, branch, conditional, pipe, race } from "@macrofx/core";
import { createStdEngine } from "@macrofx/std";

// Sequential pipeline
const pipeline = pipe<Base>()(fetchUser, enrichProfile, cacheResult);

// Parallel execution
const parallel = all<Base>()(fetchUser, fetchOrders, fetchRecommendations);
const engine = createStdEngine<Base>();
const [user, orders, recs] = await engine.run(parallel, base);

// Race to first completion
const fastest = race<Base>()(primaryDb, secondaryDb, cache);

// Branch with ts-pattern
const tieredStep = branch<"free" | "pro" | "enterprise", Base>(plan)
  .with("free", freeTierStep)
  .with("pro", proTierStep)
  .otherwise(enterpriseTierStep);

// Conditional execution
const conditional = conditional<Base>()(
  (ctx) => ctx.isPremium,
  premiumStep,
  standardStep,
);
```

### Context Helpers

Enhanced execution context with utility methods:

```typescript
async run(ctx) {
  // Telemetry spans
  return await ctx.span("fetch-user", async (ctx) => {
    const user = await ctx.kv.get(key);
    return user;
  });

  // Request-scoped memoization
  const cachedResult = await ctx.memo("expensive-calc", () => {
    return heavyComputation();
  });

  // Spawn child steps with additional capabilities
  const result = await ctx.child(
    { http: { baseUrl: "https://api.example.com" } },
    apiCallStep
  );
}
```

### Enhanced Validation & Error Messages

Helpful validation with suggestions:

```typescript
import { assertValidStep, validateStep } from "@macrofx/core";

const result = validateStep(step, macros);
if (!result.valid) {
  console.error(formatValidationErrors(result.errors));
  // Output:
  // 1. [UNKNOWN_CAPABILITY] Step declares capability 'redis' but no matching macro is registered
  //    💡 Did you mean 'kv'? Add the corresponding macro to your macros array
}

// Throws with detailed message
assertValidStep(step, macros);
```

### Testing Enhancements

New testing utilities for policy assertions and snapshots:

```typescript
import { createPolicyTracker, snapshotPort } from "@macrofx/testing";

// Track and assert on policies
const tracker = createPolicyTracker();
// ... execute steps ...
tracker.assertions.expectRetried(3);
tracker.assertions.expectCircuitOpen("api");
tracker.assertions.expectIdempotencyHit("req-123");

// Snapshot port interactions
const { port, interactions } = snapshotPort(kvPort);
await port.set("key", "value");
console.log(interactions); // [{ method: "set", args: ["key", "value"], result: undefined }]
```

## Publishing Strategy

Packages are published separately:

- `@macrofx/core` - Core executor, Result type, meta builder, composition,
  validation
- `@macrofx/std` - Standard macros and policies
- `@macrofx/ports` - Type-only port definitions
- `@macrofx/resources` - Resource management utilities
- `@macrofx/testing` - Testing utilities, fakes, policy assertions, snapshots
