# Overview

`macrofx-unified` orchestrates **capabilities** (pure effect ports) and
**leases** (scoped resources) through a single pipeline. You describe what a
step needs in static `meta`, and the executor injects exactly those ports into
`run(ctx)` at runtime while preserving compile-time safety.

## Six-Phase Executor

1. **validate** – sanity check the step shape.
2. **resolve** – run macros that match the step meta to materialise ports,
   leases, and policy helpers.
3. **weave** – apply policies uniformly (retry/timeout/log/circuit/idempotency)
   to both effects and resource acquires.
4. **before** – invoke macro guards (e.g. idempotency cache lookup) with the
   assembled context.
5. **run** – execute your pure business function with a context that only
   exposes declared capabilities plus `meta`.
6. **after/onError** – allow macros to persist results, emit telemetry, or
   recover from failures.

Because the pipeline is declarative, swapping hosts (Node, Deno, edge) or
policies requires only meta tweaks rather than code edits.

## Capabilities vs. Leases

- **Ports** (`http`, `kv`, `db`, `queue`, `time`, `crypto`, `log`…) are
  side-effect surfaces – just functions.
- **Leases** (`db`, `tx`, `tempDir`, `lock`, `socket`) produce `Lease<T, Scope>`
  handles that cannot escape their scope. Use the provided `bracket` helper or
  higher-level combinators to guarantee cleanup.
- The executor now merges multiple lease providers, so requesting
  `db + fs + lock` in one step yields a single `lease` object exposing all three
  openers.

## Policies

Policies are declared in `meta` and woven in automatically:

- `retry` – exponential-friendly retry with optional jitter.
- `timeout` – hard stop for effect calls and separate `acquireMs` for leases.
- `circuit` – lightweight breaker that trips on failure and reopens after
  `halfOpenAfterMs`.
- `idempotency` – KV-backed short-circuit that bypasses `run` when a cached
  result exists.
- `log` – structured debug/info/warn/error hooks applied across ports and
  leases.

Policies compose; order of application is well-defined (circuit → log → retry →
timeout) and consistent for both ports and resource acquires.

## Design Principles

- **Light FP** – functions, types, and a tiny executor. No decorators or class
  hierarchies.
- **Meta-first** – type inference flows from the declarative `meta`, so
  consumers only access what they declare.
- **Developer ergonomics** – `defineStep<Base>()` preserves literal inference
  without verbose generic signatures. New fluent meta builder and step
  composition utilities make complex workflows readable.
- **Host agnostic** – macros depend on host-provided factories (`makeHttp`,
  `makeDb`, …); swap `env` objects to target Node, Deno, workers, or tests.
- **Testable** – `@macrofx/testing` supplies fakes; the executor accepts any env
  implementing the same factories.

## New Ergonomic Features

### Result Type
Type-safe error handling without exceptions using `Result<T, E>` with functional
combinators (`map`, `flatMap`, `matchResult`). Wrap steps with `withResult()` to
return Results instead of throwing.

### Meta Builder
Fluent API for building meta objects: `meta().withDb("ro").withKv("ns").build()`.
Compose meta with `mergeMeta()` and `extendMeta()`.

### Step Composition
- `pipe()` – sequential pipelines
- `allSteps()` – parallel execution
- `race()` – first-to-complete
- `branch()` – pattern-matched routing with ts-pattern
- `conditional()` – if/else step selection

### Context Helpers
Enhanced execution context with `ctx.span()`, `ctx.child()`, and `ctx.memo()` for
telemetry, nested steps, and request-scoped caching.

### Better Validation
Helpful error messages with suggestions using Levenshtein distance for typo
detection.

For details, see [`docs/ergonomic-enhancements.md`](./ergonomic-enhancements.md).

For a tour of the API surface, see [`docs/api.md`](./api.md). Hands-on guides
live in [`docs/examples.md`](./examples.md) and the new scenario docs referenced
there.
