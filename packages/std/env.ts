import {
  brandLease,
  type DbPort,
  type Lease,
  type LeasePort,
  type LockHandle,
  type LogLevel,
  type LogPort,
  type QueuePort,
  type Releasable,
  type Socket,
  type TimePort,
} from "../ports/mod.ts";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const circuitStates = new Map<string, { openUntil?: number }>();

export const stdEnv = {
  makeHttp(baseUrl = "", _opts?: { auth?: "bearer" | "none" }) {
    const toUrl = (path: string) =>
      new URL(path, baseUrl || "http://localhost");
    return {
      get(path: string, init?: RequestInit) {
        return fetch(toUrl(path), { ...init, method: "GET" });
      },
      post(path: string, body?: unknown, init?: RequestInit) {
        return fetch(toUrl(path), {
          ...init,
          method: "POST",
          body: body ? JSON.stringify(body) : undefined,
          headers: {
            "content-type": "application/json",
            ...(init?.headers || {}),
          },
        });
      },
    };
  },

  makeKv(namespace: string) {
    const store = new Map<string, { value: unknown; exp?: number }>();
    const keyFor = (key: string) => `${namespace}:${key}`;
    return {
      async get<T>(key: string) {
        const record = store.get(keyFor(key));
        if (!record) return null;
        if (record.exp && record.exp < Date.now()) {
          store.delete(keyFor(key));
          return null;
        }
        return record.value as T;
      },
      async set<T>(key: string, value: T, ttlMs?: number) {
        store.set(keyFor(key), {
          value,
          exp: ttlMs ? Date.now() + ttlMs : undefined,
        });
      },
      async del(key: string) {
        store.delete(keyFor(key));
      },
    };
  },

  makeDb(_meta: { role: "ro" | "rw" }) {
    const rows: Record<string, Array<Record<string, unknown>>> = {
      "select id, name from users where id = $1": [{ id: "123", name: "Ada" }],
    };

    const db: DbPort = {
      async query<T>(sql: string, _params?: unknown[]) {
        return (rows[sql] || []) as T[];
      },
      async begin() {},
      async commit() {},
      async rollback() {},
    };

    const leaseDb = async <Scope>(_role: "ro" | "rw") => {
      return {
        value: brandLease<DbPort, Scope>(db),
        release: async () => {},
      } as Releasable<Lease<DbPort, Scope>>;
    };

    const tx = async <Scope, T>(
      fn: (db: Lease<DbPort, Scope>) => Promise<T>,
    ) => {
      const leased = brandLease<DbPort, Scope>(db);
      return await fn(leased);
    };

    return {
      db,
      lease: { db: leaseDb, tx },
    };
  },

  makeQueue(name: string): QueuePort {
    return {
      async enqueue(msg) {
        console.log(`[queue:${name}]`, msg);
      },
    };
  },

  makeTime(): TimePort {
    return {
      now: () => Date.now(),
      async sleep(ms: number) {
        await new Promise((res) => setTimeout(res, ms));
      },
    };
  },

  makeCrypto() {
    return {
      uuid: () => crypto.randomUUID(),
      async hash(value: string, algo: "sha256" | "none" = "sha256") {
        if (algo === "none") return value;
        const encoder = new TextEncoder();
        const buffer = encoder.encode(value);
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return toHex(digest);
      },
    };
  },

  makeLogger(level: LogLevel = "info"): LogPort {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const threshold = levels.indexOf(level);
    const log = (lvl: LogLevel) => (message: string, data?: unknown) => {
      if (levels.indexOf(lvl) < threshold) return;
      const suffix = data ? ` ${JSON.stringify(data)}` : "";
      console.log(`[${lvl}] ${message}${suffix}`);
    };
    return {
      level,
      debug: log("debug"),
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
    };
  },

  fs: {
    async mkdtemp(prefix = "tmp-") {
      return `${prefix}${crypto.randomUUID()}`;
    },
    async rm(_path: string, _opts?: { recursive?: boolean }) {
      // no-op for in-memory temp dirs
    },
  },

  makeCircuit(name: string) {
    const key = name || "default";
    let state = circuitStates.get(key);
    if (!state) {
      state = { openUntil: 0 };
      circuitStates.set(key, state);
    }
    return state;
  },

  makeLock: () =>
  async <Scope>(
    key: string,
  ): Promise<Releasable<Lease<LockHandle, Scope>>> => ({
    value: brandLease<LockHandle, Scope>({ key }),
    release: async () => {},
  }),

  makeSocket: () =>
  async <Scope>(
    _host: string,
    _port: number,
  ): Promise<Releasable<Lease<Socket, Scope>>> => ({
    value: brandLease<Socket, Scope>({
      write: async () => {},
      close: async () => {},
    }),
    release: async () => {},
  }),
};

export type StdEnv = typeof stdEnv;
