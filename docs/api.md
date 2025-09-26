# API

Primary types live in `@macrofx/core` (`packages/core`). The snippets below
mirror the source to keep signatures accurate.

## `execute(step, config)`

```ts
import type { EngineConfig, Meta, Step } from "@macrofx/core";

async function execute<M extends Meta, Base, Out, Scope>(
  step: Step<M, Base, Out, Scope>,
  cfg: EngineConfig<Base, M>,
): Promise<Out>;
```

- Resolves macros that match `step.meta`, merges their capability results
  (ports + leases), weaves policies, and runs the step.
- Macros can short-circuit the run by calling `setMacroResult(ctx, value)`
  during `before` (the built-in idempotency macro uses this).
- The context passed into `run` is structurally typed as
  `Base & CapsOf<M, Scope> & { meta: M }`.

### `EngineConfig`

```ts
export type EngineConfig<Base, M extends Meta> = {
  base: Base;
  macros: Macro<M, object>[];
  env?: unknown;
};
```

- `base` – initial data available to your step (request ids, user ids, feature
  flags, etc.).
- `macros` – usually `stdMacros`, but you can supply any macro list; order
  matters when overlapping keys.
- `env` – host-specific factories consumed by macros (`makeHttp`, `makeDb`,
  `fs`, …). If you expose `makeCircuit(name, policy)`, the weaver will persist
  circuit breaker state across step executions instead of keeping a per-run
  counter.

## `Step`

```ts
export type ExecutionCtx<M extends Meta, Base, Scope> =
  & Base
  & CapsOf<M, Scope>
  & { meta: M };

export type Step<M extends Meta, Base, Out, Scope> = {
  name: string;
  meta: M;
  run: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<Out> | Out;
};
```

- `meta` drives both type inference (what appears on `ctx`) and runtime
  selection of macros/policies.
- `Scope` is an opaque type brand you can use to prevent leases from escaping a
  given pipeline (commonly `symbol`).

## `defineStep`

```ts
export function defineStep<Base, Scope = symbol>(): <
  const M extends Meta,
  Out,
>(
  step: {
    name: string;
    meta: M;
    run: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<Out> | Out;
  },
) => Step<M, Base, Out, Scope>;
```

- Use `defineStep<Base>()({ … })` to capture `meta` literals without manual
  `Step<…>` annotations.
- Override the optional `Scope` parameter when you want a dedicated runtime
  symbol for lease branding.

## Capabilities inference

```ts
export type CapsOf<M extends Meta, Scope> =
  & (M["http"] extends object ? { http: HttpPort } : {})
  & (M["kv"] extends object ? { kv: KvPort } : {})
  & (M["db"] extends object ? { db?: DbPort } : {})
  & (M["queue"] extends object ? { queue: QueuePort } : {})
  & (M["time"] extends object ? { time: TimePort } : {})
  & (M["crypto"] extends object ? { crypto: CryptoPort } : {})
  & (M["log"] extends object ? { log: LogPort } : {})
  & (M["db"] extends object ? { lease: Pick<LeasePort<Scope>, "db" | "tx"> }
    : {})
  & (M["fs"] extends object ? { lease: Pick<LeasePort<Scope>, "tempDir"> } : {})
  & (M["lock"] extends object ? { lease: Pick<LeasePort<Scope>, "lock"> } : {})
  & (M["socket"] extends object ? { lease: Pick<LeasePort<Scope>, "socket"> }
    : {})
  & { bracket: Bracket };
```

Every matching macro contributes to the eventual `lease` object. The executor
deep-merges these contributions so `lease.db`, `lease.tempDir`, and `lease.lock`
can coexist in one step.

## `Macro`

```ts
export type Macro<M, Caps> = {
  key: string;
  match: (meta: M) => boolean;
  resolve: (meta: M, env: unknown) => Promise<Caps>;
  before?: (ctx: unknown) => Promise<void>;
  onError?: (error: unknown, ctx: unknown) => Promise<unknown>;
  after?: <T>(value: T, ctx: unknown) => Promise<T>;
};
```

- `match` should be pure – it is evaluated multiple times per run.
- `resolve` is allowed to return partial capability objects; the executor merges
  them.
- `before` / `after` / `onError` run only when `match(meta)` is truthy.
- Use `before` to gate execution (e.g. cache hits, rate limits), `after` to
  persist side effects, and `onError` for focused recovery.

### Macro helpers

```ts
import { getMacroResult, hasMacroResult, setMacroResult } from "@macrofx/core";
```

- `setMacroResult(ctx, value)` – short-circuits the executor before `run` when
  invoked inside a `before` hook, or overrides the return value when used in
  `after/onError`.
- `hasMacroResult(ctx)` / `getMacroResult(ctx)` – inspect whether a prior macro
  already supplied a value.
- These helpers replace the old `ctx.__macrofxSkip`/`ctx.__macrofxValue` fields
  with symbol-backed utilities.

## `bracket`

```ts
export async function bracket<T, R>(
  acquire: () => Promise<Releasable<T>>,
  use: (value: T) => Promise<R>,
  finalizer?: (value: T) => Promise<void>,
): Promise<R>;
```

Wrap resource lifetimes in `bracket` to guarantee release even if `use` throws.
Supply an optional `finalizer` when a post-use cleanup (flushing metrics,
deleting temp files) should run before the lease is released.

> All code examples in this document mirror the source code in `packages/core`
> as of September 25, 2025. Run `deno task fmt` after editing to keep signatures
> in sync.
