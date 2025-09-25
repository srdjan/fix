import { createHash, randomUUID } from "node:crypto";
import { mkdtemp as _mkdtemp, rm as _rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DbPort,
  HttpPort,
  KvPort,
  Lease,
  LeasePort,
  LogLevel,
  LogPort,
  QueuePort,
  TimePort,
} from "../ports/mod.ts";
import { makePool } from "../resources/pool.ts";

// --- HTTP (fetch-based) ---
export function makeHttp(
  baseUrl = "",
  _opts?: { auth?: "bearer" | "none" },
): HttpPort {
  const toURL = (p: string) => new URL(p, baseUrl || "http://localhost");
  return {
    get: (p, init) => fetch(toURL(p), { ...init, method: "GET" }),
    post: (p, body, init) =>
      fetch(toURL(p), {
        ...init,
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          "content-type": "application/json",
          ...(init?.headers || {}),
        },
      }),
  };
}

// --- KV (in-memory Map) ---
export function makeKv(namespace: string): KvPort {
  const store = new Map<string, { value: unknown; exp?: number }>();
  const k = (key: string) => `${namespace}:${key}`;
  return {
    async get<T>(key: string) {
      const v = store.get(k(key));
      if (!v) return null;
      if (v.exp && v.exp < Date.now()) {
        store.delete(k(key));
        return null;
      }
      return v.value as T;
    },
    async set<T>(key: string, value: T, ttlMs?: number) {
      store.set(k(key), { value, exp: ttlMs ? Date.now() + ttlMs : undefined });
    },
    async del(key: string) {
      store.delete(k(key));
    },
  };
}

// --- DB (fake, in-memory) ---
type Row = Record<string, unknown>;
export function makeDb(meta: { role: "ro" | "rw" }) {
  // very small fake DB: returns canned rows for demonstration
  const rows: Record<string, Row[]> = {
    "select id, name from users where id = $1": [{ id: "123", name: "Ada" }],
  };

  const base: DbPort = {
    async query<T>(sql: string, _params?: unknown[]) {
      return (rows[sql] || []) as T[];
    },
    async begin() {},
    async commit() {},
    async rollback() {},
  };

  // Provide both effect port (db) and resource openers (lease.db/lease.tx)
  const pool = makePool(async () => base, async (_db) => {}, 4);

  async function tx<T>(fn: (db: Lease<DbPort, any>) => Promise<T>): Promise<T> {
    const db = await pool.acquire();
    try {
      await db.begin();
      const out = await fn(db as Lease<DbPort, any>);
      await db.commit();
      await pool.release(db);
      return out;
    } catch (e) {
      try {
        await db.rollback();
      } finally {
        await pool.release(db);
      }
      throw e;
    }
  }

  const leaseDb = async <S>(_role: "ro" | "rw") => {
    const db = await pool.acquire();
    return {
      value: db as Lease<DbPort, S>,
      release: async () => {
        await pool.release(db);
      },
    };
  };

  return {
    db: base,
    lease: { db: leaseDb, tx },
  };
}

// --- Queue (no-op, in-memory) ---
export function makeQueue(name: string): QueuePort {
  return {
    async enqueue(msg) {
      console.log(`[queue:${name}]`, msg);
    },
  };
}

// --- Time ---
export function makeTime(): TimePort {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

// --- Crypto ---
export function makeCrypto() {
  return {
    uuid: () => randomUUID(),
    async hash(s: string, algo: "sha256" | "none" = "sha256") {
      if (algo === "none") return s;
      return createHash("sha256").update(s).digest("hex");
    },
  };
}

// --- Logger ---
export function makeLogger(level: LogLevel = "info"): LogPort {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  const idx = levels.indexOf(level);
  const log = (lvl: LogLevel) => (msg: string, data?: unknown) => {
    if (levels.indexOf(lvl) < idx) return;
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.log(`[${lvl}] ${msg}${payload}`);
  };
  return {
    level,
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
}

// --- FS host for tempDir ---
export const fs = {
  async mkdtemp(prefix = "tmp-") {
    const p = await _mkdtemp(join(tmpdir(), prefix));
    return p;
  },
  async rm(path: string, opts?: { recursive?: boolean }) {
    await _rm(path, { recursive: opts?.recursive ?? true, force: true });
  },
};

// Export env bundle for std macros
export const hostNodeEnv = {
  makeHttp,
  makeKv,
  makeDb,
  makeQueue,
  makeTime,
  makeCrypto,
  makeLogger,
  fs,
  makeLock: () => async (key: string) => ({
    value: { key },
    release: async () => {},
  }),
  makeSocket: () => async (_host: string, _port: number) => ({
    value: { write: async () => {}, close: async () => {} },
    release: async () => {},
  }),
};
