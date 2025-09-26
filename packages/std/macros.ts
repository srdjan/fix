import {
  type ExecutionCtx,
  getMacroResult,
  hasMacroResult,
  type Macro,
  type Meta,
  setMacroResult,
} from "../core/types.ts";
import type {
  CryptoPort,
  DbPort,
  HttpPort,
  KvPort,
  LeasePort,
  LogPort,
  QueuePort,
  TimePort,
} from "../ports/mod.ts";
import type { StdEnv } from "./env.ts";
import { tempDirOp } from "../resources/fs.ts";

// Built-in capability macros use env to produce ports/openers.
// env shape is host-defined. We expect functions like makeHttp(), makeKv(), etc.

export const httpMacro: Macro<Meta, { http: HttpPort }, StdEnv> = {
  key: "http",
  match: (m) => !!m.http,
  resolve: (m, env: StdEnv) => {
    const baseUrl = m.http?.baseUrl ?? "";
    return Promise.resolve({ http: env.makeHttp(baseUrl, m.http) });
  },
};

export const kvMacro: Macro<Meta, { kv: KvPort }, StdEnv> = {
  key: "kv",
  match: (m) => !!m.kv,
  resolve: (m, env: StdEnv) =>
    Promise.resolve({ kv: env.makeKv(m.kv!.namespace) }),
};

export const dbMacro: Macro<
  Meta,
  { db: DbPort } & { lease: Pick<LeasePort<any>, "db" | "tx"> },
  StdEnv
> = {
  key: "db",
  match: (m) => !!m.db,
  resolve: (m, env: StdEnv) => Promise.resolve(env.makeDb(m.db!)),
};

export const queueMacro: Macro<Meta, { queue: QueuePort }, StdEnv> = {
  key: "queue",
  match: (m) => !!m.queue,
  resolve: (m, env: StdEnv) =>
    Promise.resolve({ queue: env.makeQueue(m.queue!.name) }),
};

export const timeMacro: Macro<Meta, { time: TimePort }, StdEnv> = {
  key: "time",
  match: (m) => !!m.time,
  resolve: (_m, env: StdEnv) => Promise.resolve({ time: env.makeTime() }),
};

export const cryptoMacro: Macro<Meta, { crypto: CryptoPort }, StdEnv> = {
  key: "crypto",
  match: (m) => !!m.crypto,
  resolve: (_m, env: StdEnv) => Promise.resolve({ crypto: env.makeCrypto() }),
};

export const logMacro: Macro<Meta, { log: LogPort }, StdEnv> = {
  key: "log",
  match: (m) => !!m.log,
  resolve: (m, env: StdEnv) =>
    Promise.resolve({ log: env.makeLogger(m.log!.level) }),
};

// Resource macros

export const fsMacro: Macro<
  Meta,
  { lease: Pick<LeasePort<any>, "tempDir"> },
  StdEnv
> = {
  key: "fs",
  match: (m) => !!m.fs?.tempDir,
  resolve: (_m, env: StdEnv) => {
    const acquire = tempDirOp(env.fs);
    return Promise.resolve({ lease: { tempDir: acquire } as any });
  },
};

export const lockMacro: Macro<
  Meta,
  { lease: Pick<LeasePort<any>, "lock"> },
  StdEnv
> = {
  key: "lock",
  match: (m) => !!m.lock,
  resolve: (_m, env: StdEnv) =>
    Promise.resolve({ lease: { lock: env.makeLock() } as any }),
};

export const socketMacro: Macro<
  Meta,
  { lease: Pick<LeasePort<any>, "socket"> },
  StdEnv
> = {
  key: "socket",
  match: (m) => !!m.socket,
  resolve: (_m, env: StdEnv) =>
    Promise.resolve({
      lease: { socket: env.makeSocket() } as any,
    }),
};

// Policies that need before/after/onError can be added here (e.g., idempotency).
// Minimal placeholder for idempotency policy hooking into kv if present.

export const idempotencyMacro: Macro<Meta, Record<string, never>> = {
  key: "idempotency",
  match: (m) => !!m.idempotency,
  resolve: () => Promise.resolve({}),
  before: async (ctx: ExecutionCtx<any, any, any>) => {
    const key: string | undefined = ctx?.meta?.idempotency?.key ??
      ctx?.idempotencyKey;
    if (!key || !ctx.kv) return;
    const existing = await ctx.kv.get(`idem:${key}`);
    if (existing !== null && existing !== undefined) {
      ctx.log?.info?.("idempotency.hit", { key });
      setMacroResult(ctx, existing);
    }
  },
  after: async (value: any, ctx: ExecutionCtx<any, any, any>) => {
    const key: string | undefined = ctx?.meta?.idempotency?.key ??
      ctx?.idempotencyKey;
    if (!key || !ctx.kv) return value;
    if (hasMacroResult(ctx)) {
      return getMacroResult(ctx);
    }
    await ctx.kv.set(
      `idem:${key}`,
      value,
      ctx.meta?.idempotency?.ttlMs ?? 5 * 60_000,
    );
    return value;
  },
};

export const stdMacros = [
  httpMacro,
  kvMacro,
  dbMacro,
  queueMacro,
  timeMacro,
  cryptoMacro,
  logMacro,
  fsMacro,
  lockMacro,
  socketMacro,
  idempotencyMacro,
] as const;
