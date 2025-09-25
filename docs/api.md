# API

## `execute(step, config)`

Runs a single step with the provided base context, macros, and host env.

## `Macro`

```ts
type Macro<M, Caps> = {
  key: string;
  match(m: M): boolean;
  resolve(m: M, env: unknown): Promise<Caps>;
  before?(ctx: any): Promise<void>;
  onError?(e: unknown, ctx: any): Promise<never | unknown>;
  after?<T>(value: T, ctx: any): Promise<T>;
};
```

- **resolve** returns partial caps (ports / lease openers).
- **before/after** optionally add guards or telemetry.

## `Bracket`

```ts
async function bracket<T, R>(
  acquire: () => Promise<Releasable<T>>,
  use: (t: T) => Promise<R>,
  finalizer?: (t: T) => Promise<void>
): Promise<R>
```

Guarantees cleanup even on error.
