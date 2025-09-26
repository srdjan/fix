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
  host-node/      # Node-compatible host bindings (fetch, crypto, fs, in-memory kv/db)
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
- **Host-agnostic**: Swap `host-node` (Node.js), `host-deno` (Deno), or write
  custom host adapters
- **Effect/resource unification**: One `meta`, one `CapsOf<M>`, one policy
  weaver for both

## Writing Steps

Use `defineStep<Base, Scope>()` to create type-safe steps:

```typescript
import { defineStep, execute } from "@macrofx/core";
import { stdMacros } from "@macrofx/std";
import { hostNodeEnv } from "@macrofx/host-node";

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

const result = await execute(step, {
  base: { requestId: "123", userId: "456" },
  macros: stdMacros,
  env: hostNodeEnv,
});
```

## Testing

- **Unit tests**: Pure domain logic (no permissions needed)
- **Integration tests**: Use `@macrofx/testing` fakes
- **Chaos testing**: Use `withChaos()` wrapper to inject failures/latency

Example with fakes:

```typescript
import { fakeKv, fakeLogger } from "@macrofx/testing";

Deno.test("step with fakes", async () => {
  const kv = fakeKv();
  const log = fakeLogger();

  const result = await execute(step, {
    base: { userId: "test" },
    macros: stdMacros,
    env: { makeKv: () => kv, makeLogger: () => log },
  });

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

## Publishing Strategy

Packages are published separately:

- `@macrofx/core` - Core executor and types
- `@macrofx/std` - Standard macros and policies
- `@macrofx/ports` - Type-only port definitions
- `@macrofx/resources` - Resource management utilities
- `@macrofx/host-node` - Node.js host adapter
- `@macrofx/testing` - Testing utilities and fakes
