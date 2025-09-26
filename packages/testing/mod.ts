import type { HttpPort, KvPort, TimePort } from "../ports/mod.ts";

type LogEntry = ["debug" | "info" | "warn" | "error", string, unknown?];

type HttpHandler =
  | Response
  | Record<string, unknown>
  | null
  | ((ctx: { method: string; path: string; body?: unknown }) =>
    | Response
    | Record<string, unknown>
    | null
    | Promise<Response | Record<string, unknown> | null>);

type ChaosOptions = {
  failRate?: number;
  latencyMs?: number | ((method: PropertyKey) => number);
  random?: () => number;
  errorFactory?: (method: PropertyKey) => Error;
};

const toResponse = async (
  handler: HttpHandler | undefined,
  ctx: { method: string; path: string; body?: unknown },
): Promise<Response> => {
  if (!handler) {
    return new Response("not found", { status: 404 });
  }
  const value = typeof handler === "function" ? await handler(ctx) : handler;
  if (value instanceof Response) return value;
  if (value === null) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function fakeLogger() {
  const logs: LogEntry[] = [];
  return {
    logs,
    logger: {
      level: "debug" as const,
      debug: (m: string, d?: unknown) => logs.push(["debug", m, d]),
      info: (m: string, d?: unknown) => logs.push(["info", m, d]),
      warn: (m: string, d?: unknown) => logs.push(["warn", m, d]),
      error: (m: string, d?: unknown) => logs.push(["error", m, d]),
    },
  };
}

export function fakeKv(initial: Record<string, unknown> = {}) {
  const store = new Map<string, { value: unknown; exp?: number }>();
  for (const [key, value] of Object.entries(initial)) {
    store.set(key, { value });
  }

  const port: KvPort = {
    get<T>(key: string) {
      const record = store.get(key);
      if (!record) return Promise.resolve(null);
      if (record.exp && record.exp < Date.now()) {
        store.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(record.value as T);
    },
    set<T>(key: string, value: T, ttlMs?: number) {
      store.set(key, {
        value,
        exp: ttlMs ? Date.now() + ttlMs : undefined,
      });
      return Promise.resolve();
    },
    del(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
  };

  return { port, store };
}

export function fakeHttp(initial: Record<string, HttpHandler> = {}) {
  const handlers = new Map<string, HttpHandler>(Object.entries(initial));
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const keyFor = (method: string, path: string) =>
    `${method.toUpperCase()} ${path}`;

  const port: HttpPort = {
    async get(path: string, _init?: RequestInit) {
      const method = "GET";
      calls.push({ method, path });
      return await toResponse(
        handlers.get(keyFor(method, path)) ?? handlers.get(path),
        {
          method,
          path,
        },
      );
    },
    async post(path: string, body?: unknown, init?: RequestInit) {
      const method = "POST";
      const payload = body ?? init?.body;
      calls.push({ method, path, body: payload });
      return await toResponse(
        handlers.get(keyFor(method, path)) ?? handlers.get(path),
        {
          method,
          path,
          body: payload,
        },
      );
    },
  };

  return {
    port,
    calls,
    set(method: "GET" | "POST", path: string, handler: HttpHandler) {
      handlers.set(keyFor(method, path), handler);
    },
    delete(method: "GET" | "POST", path: string) {
      handlers.delete(keyFor(method, path));
    },
  };
}

export function fakeTime(start = Date.now()) {
  let current = start;

  const port: TimePort = {
    now: () => current,
    sleep(ms: number) {
      current += ms;
      return Promise.resolve();
    },
  };

  return {
    port,
    advance(ms: number) {
      current += ms;
    },
    set(time: number) {
      current = time;
    },
  };
}

export function withChaos<T extends object>(
  port: T,
  opts: ChaosOptions = {},
): T {
  const {
    failRate = 0,
    latencyMs = 0,
    random = Math.random,
    errorFactory = (method) => new Error(`chaos:${String(method)}`),
  } = opts;

  const wrapped: any = Array.isArray(port) ? [...(port as any)] : {};

  for (const [key, value] of Object.entries(port as Record<string, unknown>)) {
    if (typeof value !== "function") {
      wrapped[key] = value;
      continue;
    }
    wrapped[key] = async function chaosWrapped(
      this: unknown,
      ...args: unknown[]
    ) {
      const latency = typeof latencyMs === "function"
        ? latencyMs(key)
        : latencyMs;
      if (latency && latency > 0) {
        await delay(latency);
      }
      if (failRate > 0 && random() < failRate) {
        throw errorFactory(key);
      }
      return await (value as (...args: any[]) => any).apply(port, args);
    };
  }

  return wrapped as T;
}

export type PolicyAssertion = {
  expectRetried(times: number): void;
  expectCircuitOpen(name: string): void;
  expectCircuitClosed(name: string): void;
  expectTimedOut(): void;
  expectIdempotencyHit(key: string): void;
};

export function createPolicyTracker() {
  const retries = new Map<string, number>();
  const circuits = new Map<string, "open" | "closed">();
  const timeouts: string[] = [];
  const idempotencyHits = new Set<string>();

  return {
    trackRetry(method: string) {
      retries.set(method, (retries.get(method) ?? 0) + 1);
    },
    trackCircuit(name: string, state: "open" | "closed") {
      circuits.set(name, state);
    },
    trackTimeout(method: string) {
      timeouts.push(method);
    },
    trackIdempotencyHit(key: string) {
      idempotencyHits.add(key);
    },
    assertions: {
      expectRetried(times: number) {
        const totalRetries = Array.from(retries.values()).reduce(
          (sum, n) => sum + n,
          0,
        );
        if (totalRetries !== times) {
          throw new Error(
            `Expected ${times} retries, but got ${totalRetries}`,
          );
        }
      },
      expectCircuitOpen(name: string) {
        const state = circuits.get(name);
        if (state !== "open") {
          throw new Error(
            `Expected circuit '${name}' to be open, but it was ${
              state ?? "not found"
            }`,
          );
        }
      },
      expectCircuitClosed(name: string) {
        const state = circuits.get(name);
        if (state !== "closed") {
          throw new Error(
            `Expected circuit '${name}' to be closed, but it was ${
              state ?? "not found"
            }`,
          );
        }
      },
      expectTimedOut() {
        if (timeouts.length === 0) {
          throw new Error("Expected timeout to occur, but none did");
        }
      },
      expectIdempotencyHit(key: string) {
        if (!idempotencyHits.has(key)) {
          throw new Error(
            `Expected idempotency hit for key '${key}', but none occurred`,
          );
        }
      },
    } as PolicyAssertion,
    retries,
    circuits,
    timeouts,
    idempotencyHits,
  };
}

export function snapshotPort<T extends object>(port: T): {
  port: T;
  interactions: Array<
    { method: string; args: unknown[]; result?: unknown; error?: unknown }
  >;
} {
  const interactions: Array<{
    method: string;
    args: unknown[];
    result?: unknown;
    error?: unknown;
  }> = [];

  const wrapped: any = {};

  for (const [key, value] of Object.entries(port)) {
    if (typeof value !== "function") {
      wrapped[key] = value;
      continue;
    }

    wrapped[key] = async function (...args: unknown[]) {
      const interaction: {
        method: string;
        args: unknown[];
        result?: unknown;
        error?: unknown;
      } = {
        method: key,
        args,
      };

      try {
        const result = await (value as (...args: any[]) => any).apply(
          port,
          args,
        );
        interaction.result = result;
        interactions.push(interaction);
        return result;
      } catch (error) {
        interaction.error = error;
        interactions.push(interaction);
        throw error;
      }
    };
  }

  return { port: wrapped as T, interactions };
}
