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

export type Meta = {
  // effect capabilities
  http?: { baseUrl?: string; auth?: "bearer" | "none" };
  kv?: { namespace: string };
  db?: { role: "ro" | "rw"; tx?: "required" | "new" | "none" };
  queue?: { name: string };
  time?: {};
  crypto?: { uuid?: true; hash?: "sha256" | "none" };
  log?: { level: "debug" | "info" | "warn" | "error" };

  // resources
  fs?: { tempDir?: true; workDirPrefix?: string };
  lock?: { key?: string; mode?: "exclusive" | "shared"; ttlMs?: number };
  socket?: { host?: string; port?: number };

  // policies
  retry?: { times: number; delayMs: number; jitter?: boolean };
  timeout?: { ms?: number; acquireMs?: number; holdMs?: number };
  idempotency?: { key: string; ttlMs?: number };
  circuit?: { name: string; halfOpenAfterMs?: number };
  telemetry?: { span?: string };
};

// Build the capabilities object based on meta presence.
export type CapsOf<M extends Meta, Scope> =
  & (M["http"] extends object ? { http: HttpPort } : {})
  & (M["kv"] extends object ? { kv: KvPort } : {})
  & (M["db"] extends object ? { db?: DbPort } : {})
  & // db as effect port (optional) when not using tx
  (M["queue"] extends object ? { queue: QueuePort } : {})
  & (M["time"] extends object ? { time: TimePort } : {})
  & (M["crypto"] extends object ? { crypto: CryptoPort } : {})
  & (M["log"] extends object ? { log: LogPort } : {})
  & // resource lease openers, gated by meta
  (M["db"] extends object ? { lease: Pick<LeasePort<Scope>, "db" | "tx"> } : {})
  & (M["fs"] extends object ? { lease: Pick<LeasePort<Scope>, "tempDir"> } : {})
  & (M["lock"] extends object ? { lease: Pick<LeasePort<Scope>, "lock"> } : {})
  & (M["socket"] extends object ? { lease: Pick<LeasePort<Scope>, "socket"> }
    : {})
  & { bracket: Bracket };

export type ExecutionCtx<M extends Meta, Base, Scope> =
  & Base
  & CapsOf<M, Scope>
  & { meta: M };

export type Step<M extends Meta, Base, Out, Scope> = {
  name: string;
  meta: M;
  run: (ctx: ExecutionCtx<M, Base, Scope>) => Promise<Out> | Out;
};

export type Macro<M, Caps> = {
  key: string;
  match: (m: M) => boolean;
  resolve: (m: M, env: unknown) => Promise<Caps>;
  before?: (ctx: any) => Promise<void>;
  onError?: (e: unknown, ctx: any) => Promise<never | unknown>;
  after?: <T>(value: T, ctx: any) => Promise<T>;
};

export type EngineConfig<Base, M extends Meta> = {
  base: Base;
  // default macros include http/kv/db/fs/lock/socket/log/time/crypto + policies
  macros: Macro<M, object>[];
  // host bindings; shape is up to macros
  env?: unknown;
};

export type Weaver = (meta: Meta, caps: any) => any;
