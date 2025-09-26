import {
  brandLease,
  type DbPort,
  type Lease,
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
      get<T>(key: string) {
        const record = store.get(keyFor(key));
        if (!record) return Promise.resolve(null);
        if (record.exp && record.exp < Date.now()) {
          store.delete(keyFor(key));
          return Promise.resolve(null);
        }
        return Promise.resolve(record.value as T);
      },
      set<T>(key: string, value: T, ttlMs?: number) {
        store.set(keyFor(key), {
          value,
          exp: ttlMs ? Date.now() + ttlMs : undefined,
        });
        return Promise.resolve();
      },
      del(key: string) {
        store.delete(keyFor(key));
        return Promise.resolve();
      },
    };
  },

  makeDb(_meta: { role: "ro" | "rw" }) {
    const rows: Record<string, Array<Record<string, unknown>>> = {
      "select id, name from users where id = $1": [{ id: "123", name: "Ada" }],
    };

    const db: DbPort = {
      query<T>(sql: string, _params?: unknown[]) {
        return Promise.resolve((rows[sql] || []) as T[]);
      },
      async begin() {},
      async commit() {},
      async rollback() {},
    };

    const leaseDb = <Scope>(_role: "ro" | "rw") => {
      return Promise.resolve({
        value: brandLease<DbPort, Scope>(db),
        release: async () => {},
      } as Releasable<Lease<DbPort, Scope>>);
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
      enqueue(msg) {
        console.log(`[queue:${name}]`, msg);
        return Promise.resolve();
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
    mkdtemp(prefix = "tmp-") {
      return Promise.resolve(`${prefix}${crypto.randomUUID()}`);
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
  <Scope>(
    key: string,
  ): Promise<Releasable<Lease<LockHandle, Scope>>> =>
    Promise.resolve({
      value: brandLease<LockHandle, Scope>({ key }),
      release: async () => {},
    }),

  makeSocket: () =>
  <Scope>(
    _host: string,
    _port: number,
  ): Promise<Releasable<Lease<Socket, Scope>>> =>
    Promise.resolve({
      value: brandLease<Socket, Scope>({
        write: async () => {},
        close: async () => {},
      }),
      release: async () => {},
    }),
};

export type StdEnv = typeof stdEnv;
