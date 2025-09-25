import type { Macro, Meta } from "../core/types.ts";
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
import { tempDirOp } from "../resources/fs.ts";

// Built-in capability macros use env to produce ports/openers.
// env shape is host-defined. We expect functions like makeHttp(), makeKv(), etc.

export const httpMacro: Macro<Meta, { http: HttpPort }> = {
  key: "http",
  match: (m) => !!m.http,
  resolve: async (m, env: any) => {
    const baseUrl = m.http?.baseUrl ?? "";
    return { http: env.makeHttp(baseUrl, m.http) };
  },
};

export const kvMacro: Macro<Meta, { kv: KvPort }> = {
  key: "kv",
  match: (m) => !!m.kv,
  resolve: async (m, env: any) => ({ kv: env.makeKv(m.kv!.namespace) }),
};

export const dbMacro: Macro<
  Meta,
  { db: DbPort } & { lease: Pick<LeasePort<any>, "db" | "tx"> }
> = {
  key: "db",
  match: (m) => !!m.db,
  resolve: async (m, env: any) => env.makeDb(m.db!),
};

export const queueMacro: Macro<Meta, { queue: QueuePort }> = {
  key: "queue",
  match: (m) => !!m.queue,
  resolve: async (m, env: any) => ({ queue: env.makeQueue(m.queue!.name) }),
};

export const timeMacro: Macro<Meta, { time: TimePort }> = {
  key: "time",
  match: (m) => !!m.time,
  resolve: async (_m, env: any) => ({ time: env.makeTime() }),
};

export const cryptoMacro: Macro<Meta, { crypto: CryptoPort }> = {
  key: "crypto",
  match: (m) => !!m.crypto,
  resolve: async (_m, env: any) => ({ crypto: env.makeCrypto() }),
};

export const logMacro: Macro<Meta, { log: LogPort }> = {
  key: "log",
  match: (m) => !!m.log,
  resolve: async (m, env: any) => ({ log: env.makeLogger(m.log!.level) }),
};

// Resource macros

export const fsMacro: Macro<Meta, { lease: Pick<LeasePort<any>, "tempDir"> }> =
  {
    key: "fs",
    match: (m) => !!m.fs?.tempDir,
    resolve: async (m, env: any) => {
      const acquire = tempDirOp(env.fs);
      return { lease: { tempDir: acquire } as any };
    },
  };

export const lockMacro: Macro<Meta, { lease: Pick<LeasePort<any>, "lock"> }> = {
  key: "lock",
  match: (m) => !!m.lock,
  resolve: async (_m, env: any) => ({ lease: { lock: env.makeLock() } as any }),
};

export const socketMacro: Macro<
  Meta,
  { lease: Pick<LeasePort<any>, "socket"> }
> = {
  key: "socket",
  match: (m) => !!m.socket,
  resolve: async (_m, env: any) => ({
    lease: { socket: env.makeSocket() } as any,
  }),
};

// Policies that need before/after/onError can be added here (e.g., idempotency).
// Minimal placeholder for idempotency policy hooking into kv if present.

export const idempotencyMacro: Macro<Meta, {}> = {
  key: "idempotency",
  match: (m) => !!m.idempotency,
  resolve: async () => ({}),
  before: async (ctx: any) => {
    const key: string | undefined = ctx?.meta?.idempotency?.key ??
      ctx?.idempotencyKey;
    if (!key || !ctx.kv) return;
    const existing = await ctx.kv.get(`idem:${key}`);
    if (existing !== null && existing !== undefined) {
      ctx.log?.info?.("idempotency.hit", { key });
      ctx.__macrofxSkip = true;
      ctx.__macrofxValue = existing;
    }
  },
  after: async (value: any, ctx: any) => {
    const key: string | undefined = ctx?.meta?.idempotency?.key ??
      ctx?.idempotencyKey;
    if (!key || !ctx.kv) return value;
    if (ctx.__macrofxSkip) return ctx.__macrofxValue;
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
