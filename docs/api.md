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

## New Ergonomic APIs

### Result Type

```ts
export type Result<T, E> = Ok<T> | Err<E>;

// Constructors
export const ok: <T>(value: T) => Ok<T>;
export const err: <E>(error: E) => Err<E>;

// Combinators
export const map: <T, E, U>(r: Result<T, E>, fn: (value: T) => U) => Result<U, E>;
export const flatMap: <T, E, U>(r: Result<T, E>, fn: (value: T) => Result<U, E>) => Result<U, E>;
export const matchResult: <T, E, R>(result: Result<T, E>, onOk: (value: T) => R, onErr: (error: E) => R) => R;

// Collection operations
export const all: <T extends readonly Result<any, any>[]>(results: T) => Result<...>;
export const sequence: <T, E>(results: readonly Result<T, E>[]) => Result<readonly T[], E>;
export const traverse: <T, U, E>(items: readonly T[], fn: (item: T) => Result<U, E>) => Result<readonly U[], E>;
```

### Meta Builder

```ts
export const meta: () => MetaBuilder<{}>;
export const mergeMeta: <M1, M2>(m1: M1, m2: M2) => M1 & M2;
export const extendMeta: <M, E>(base: M, extension: E) => M & E;

// Fluent API
const myMeta = meta()
  .withDb("ro")
  .withKv("namespace")
  .withRetry(3, 100, true)
  .withTimeout({ ms: 5000 })
  .withLog("debug")
  .build();
```

### Step Composition

```ts
// Sequential pipeline
export const pipe: <Base, Scope>() => <Steps>(...steps: Steps) => Step<...>;

// Parallel execution
export const allSteps: <Base, Scope>() => <Steps>(...steps: Steps) => Step<...>;

// First to complete
export const race: <Base, Scope>() => <Steps>(...steps: Steps) => Step<...>;

// Pattern-matched branching (uses ts-pattern)
export class Branch<V, Base, Scope> {
  with<M, Out, P>(pattern: P, step: Step<M, Base, Out, Scope>): Branch<V, Base, Scope>;
  otherwise<M, Out>(step: Step<M, Base, Out, Scope>): Step<...>;
  exhaustive(): Step<...>;
}
export const branch: <V, Base, Scope>(value: V) => Branch<V, Base, Scope>;

// Conditional execution
export const conditional: <Base, Scope>() => <M1, M2, Out1, Out2>(
  predicate: (ctx: Base) => boolean | Promise<boolean>,
  ifTrue: Step<M1, Base, Out1, Scope>,
  ifFalse: Step<M2, Base, Out2, Scope>
) => Step<M1 & M2, Base, Out1 | Out2, Scope>;

// Wrap step to return Result
export const withResult: <Base, Scope>() => <M, Out>(
  step: Step<M, Base, Out, Scope>
) => Step<M, Base, Result<Out, Error>, Scope>;
```

### Context Helpers

```ts
export type ContextHelpers<M, Base, Scope> = {
  span<R>(name: string, fn: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<R> | R, opts?: SpanOptions): Promise<R>;
  child<CM, Out>(additionalMeta: CM, step: Step<CM, Base, Out, Scope>): Promise<Out>;
  memo<R>(key: string, fn: () => Promise<R> | R): Promise<R>;
};

// Automatically attached to all ExecutionCtx
async run(ctx) {
  await ctx.span("operation", async (ctx) => { /* ... */ });
  const cached = await ctx.memo("key", () => compute());
  const result = await ctx.child({ http: { baseUrl: "..." } }, step);
}
```

### Validation

```ts
export type ValidationError = { code: string; message: string; suggestion?: string; details?: any };
export type ValidationResult = { valid: true } | { valid: false; errors: readonly ValidationError[] };

export const validateStep: <M, Base, Out, Scope>(step: Step<M, Base, Out, Scope>, macros: Macro[]) => ValidationResult;
export const validateMeta: (meta: Meta, macros: Macro[]) => ValidationResult;
export const assertValidStep: <M, Base, Out, Scope>(step: Step<M, Base, Out, Scope>, macros: Macro[]) => void;
export const formatValidationErrors: (errors: readonly ValidationError[]) => string;
```

### Testing Utilities

```ts
// Policy tracking
export function createPolicyTracker(): {
  trackRetry(method: string): void;
  trackCircuit(name: string, state: "open" | "closed"): void;
  trackTimeout(method: string): void;
  trackIdempotencyHit(key: string): void;
  assertions: PolicyAssertion;
};

export type PolicyAssertion = {
  expectRetried(times: number): void;
  expectCircuitOpen(name: string): void;
  expectCircuitClosed(name: string): void;
  expectTimedOut(): void;
  expectIdempotencyHit(key: string): void;
};

// Port snapshotting
export function snapshotPort<T>(port: T): {
  port: T;
  interactions: Array<{ method: string; args: unknown[]; result?: unknown; error?: unknown }>;
};
```

> All code examples in this document mirror the source code in `packages/core`
> as of September 25, 2025. Run `deno task fmt` after editing to keep signatures
> in sync.
