import type {
  Bracket,
  CryptoPort,
  DbPort,
  HttpPort,
  KvPort,
  LeasePort,
  LogPort,
  QueuePort,
  TimePort,
} from "../ports/mod.ts";

const FIX_SKIP_SYMBOL = Symbol.for("fix.skip");
const FIX_VALUE_SYMBOL = Symbol.for("fix.value");

export const FIX_SKIP = FIX_SKIP_SYMBOL;
export const FIX_VALUE = FIX_VALUE_SYMBOL;

export type MacroResultCarrier = {
  [FIX_SKIP_SYMBOL]?: true;
  [FIX_VALUE_SYMBOL]?: unknown;
};

export function setMacroResult<T>(ctx: MacroResultCarrier, value: T): void {
  ctx[FIX_SKIP_SYMBOL] = true;
  ctx[FIX_VALUE_SYMBOL] = value;
}

export function hasMacroResult(
  ctx: MacroResultCarrier,
): ctx is MacroResultCarrier & { [FIX_SKIP_SYMBOL]: true } {
  return Boolean(ctx[FIX_SKIP_SYMBOL]);
}

export function getMacroResult<T>(ctx: MacroResultCarrier): T | undefined {
  return ctx[FIX_VALUE_SYMBOL] as T | undefined;
}

export type Meta = {
  // effect capabilities
  http?: { baseUrl?: string; auth?: "bearer" | "none" };
  kv?: { namespace: string };
  db?: { role: "ro" | "rw"; tx?: "required" | "new" | "none" };
  queue?: { name: string };
  time?: Record<string, never>;
  crypto?: { uuid?: true; hash?: "sha256" | "none" };
  log?: { level: "debug" | "info" | "warn" | "error" };

  // resources
  fs?: { tempDir?: true; workDirPrefix?: string };
  lock?: { key?: string; mode?: "exclusive" | "shared"; ttlMs?: number };
  socket?: { host?: string; port?: number };

  // policies
  retry?: { times: number; delayMs: number; jitter?: boolean };
  timeout?: { ms?: number; acquireMs?: number };
  idempotency?: { key: string; ttlMs?: number };
  circuit?: { name: string; halfOpenAfterMs?: number };
};

// Build the capabilities object based on meta presence.
type EffectCaps<M extends Meta> =
  & (M["http"] extends object ? { http: HttpPort } : Record<string, never>)
  & (M["kv"] extends object ? { kv: KvPort } : Record<string, never>)
  & (M["db"] extends object ? { db?: DbPort } : Record<string, never>)
  & (M["queue"] extends object ? { queue: QueuePort } : Record<string, never>)
  & (M["time"] extends object ? { time: TimePort } : Record<string, never>)
  & (M["crypto"] extends object ? { crypto: CryptoPort }
    : Record<string, never>)
  & (M["log"] extends object ? { log: LogPort } : Record<string, never>);

type LeaseCaps<M extends Meta, Scope> =
  & (M["db"] extends object ? Pick<LeasePort<Scope>, "db" | "tx">
    : Record<string, never>)
  & (M["fs"] extends object ? Pick<LeasePort<Scope>, "tempDir">
    : Record<string, never>)
  & (M["lock"] extends object ? Pick<LeasePort<Scope>, "lock">
    : Record<string, never>)
  & (M["socket"] extends object ? Pick<LeasePort<Scope>, "socket">
    : Record<string, never>);

type MaybeLeaseCaps<M extends Meta, Scope> = keyof LeaseCaps<M, Scope> extends
  never ? Record<string, never>
  : { lease: LeaseCaps<M, Scope> };

export type CapsOf<M extends Meta, Scope> =
  & EffectCaps<M>
  & MaybeLeaseCaps<M, Scope>
  & { bracket: Bracket };

export type ExecutionCtx<M extends Meta, Base, Scope> =
  & Base
  & CapsOf<M, Scope>
  & { meta: M }
  & MacroResultCarrier;

export type Step<M extends Meta, Base, Out, Scope> = {
  name: string;
  meta: M;
  run: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<Out> | Out;
};

export type Macro<M, Caps, Env = unknown> = {
  key: string;
  match: (m: M) => boolean;
  resolve: (m: M, env: Env) => Promise<Caps>;
  before?: (ctx: any) => Promise<void>;
  onError?: (e: unknown, ctx: any) => Promise<never | unknown>;
  after?: <T>(value: T, ctx: any) => Promise<T>;
};

export type EngineConfig<Base, M extends Meta> = {
  base: Base;
  macros: Macro<M, object>[];
  env?: unknown;
  validate?: boolean;
};

export type WeaveOptions = { getCircuit?: CircuitProvider };
export type Weaver = (meta: Meta, caps: any, opts?: WeaveOptions) => any;

export type CircuitState = { openUntil?: number };
export type CircuitProvider = (
  name: string,
  policy: NonNullable<Meta["circuit"]>,
) => CircuitState;

export function defineStep<Base, Scope = symbol>() {
  return function <const M extends Meta, Out>(
    step: {
      name: string;
      meta: M;
      run: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<Out> | Out;
    },
  ): Step<M, Base, Out, Scope> {
    return step;
  };
}
