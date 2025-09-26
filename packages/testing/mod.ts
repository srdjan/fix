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
    async get<T>(key: string) {
      const record = store.get(key);
      if (!record) return null;
      if (record.exp && record.exp < Date.now()) {
        store.delete(key);
        return null;
      }
      return record.value as T;
    },
    async set<T>(key: string, value: T, ttlMs?: number) {
      store.set(key, {
        value,
        exp: ttlMs ? Date.now() + ttlMs : undefined,
      });
    },
    async del(key: string) {
      store.delete(key);
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
    async get(path: string, init?: RequestInit) {
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
    async sleep(ms: number) {
      current += ms;
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
      return await (value as Function).apply(port, args);
    };
  }

  return wrapped as T;
}
