# Architecture

```
          +-------------------+
meta ---> |  Macro Registry   | --resolve--> capabilities (ports/openers)
          +-------------------+
                   |
                   v
             +-----------+
             |  Weaver   |  (circuit → log → retry → timeout)
             +-----------+
                   |
                   v
           +-----------------+
           |  step.run(ctx)  |  (pure, typed, minimal)
           +-----------------+
```

- `packages/core` hosts the executor, types, bracket, and policy weaver.
- `packages/std` provides built-in macros for common ports, leases, and policies
  (including idempotency and the in-memory circuit breaker).
- `packages/std/env.ts` provides default in-memory host bindings used by std
  macros; swap or extend these functions to target real infrastructure.
- `packages/resources` contains pooling utilities and the `tempDir` lease
  implementation.
- `packages/testing` exposes fakes and helpers (`fakeLogger`, chaos utilities)
  for deterministic tests.

Executor implementation highlights:

- Lease contributions from different macros are merged, so a single step can
  request `db`, `fs.tempDir`, and `lock` simultaneously.
- `ctx.meta` is injected for macro coordination and diagnostics but remains
  read-only by convention.
- Macros can short-circuit via `setMacroResult(ctx, value)` during `before`, and
  the executor respects this before invoking `run`.
- Provide `env.makeCircuit(name, policy)` to persist circuit breaker state
  across executions; otherwise an in-memory per-run breaker is used.
