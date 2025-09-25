import { execute, type Meta, type Step } from "../../packages/core/mod.ts";
import { stdMacros } from "../../packages/std/mod.ts";
import { hostNodeEnv } from "../../packages/host-node/mod.ts";

/**
 * Demonstrates retry + timeout + circuit breaker + idempotency working together
 * along with explicit error handling branches.
 */

type Base = { requestId: string; idempotencyKey: string };

type PolicyResult = {
  source: "primary" | "cached";
  user: { id: string; name: string };
  circuitOpened: boolean;
};

const flakyHttp = () => {
  let callCount = 0;
  return {
    async get(path: string) {
      callCount++;
      if (path === "/primary") {
        if (callCount === 1) {
          throw new Error("upstream 500");
        }
        return new Response(JSON.stringify({ id: "123", name: "Grace" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (path === "/secondary") {
        throw new Error("secondary unavailable");
      }
      return new Response("ok", { status: 200 });
    },
    async post(_path: string, _body?: unknown) {
      return new Response(null, { status: 204 });
    },
  };
};

const sharedKv = hostNodeEnv.makeKv("policy-demo");

const policyEnv = {
  ...hostNodeEnv,
  makeHttp: () => flakyHttp(),
  makeKv: () => sharedKv,
};

const meta = {
  http: { baseUrl: "https://api.demo" },
  kv: { namespace: "policy-demo" },
  log: { level: "debug" },
  retry: { times: 2, delayMs: 20, jitter: false },
  timeout: { ms: 500 },
  idempotency: { key: "policy-demo" },
  circuit: { name: "primary-http", halfOpenAfterMs: 5_000 },
} as const satisfies Meta;

type StepMeta = typeof meta;

const step: Step<StepMeta, Base, PolicyResult, symbol> = {
  name: "policy-combo",
  meta,
  async run({ http, kv, log, meta }) {
    const idemKey = meta.idempotency?.key || "policy-demo";
    const cacheKey = `user:${idemKey}`;

    const cached = await kv.get<{ id: string; name: string }>(cacheKey);
    if (cached) {
      log.info("policy.cached", { cacheKey });
      return { source: "cached", user: cached, circuitOpened: false };
    }

    let circuitOpened = false;

    const fetchPrimary = async () => {
      const res = await http.get("/primary");
      if (!res.ok) throw new Error(`http ${res.status}`);
      return await res.json() as { id: string; name: string };
    };

    const user = await fetchPrimary().catch((err) => {
      log.error("primary.failed", { message: String(err) });
      throw err;
    });

    try {
      await http.get("/secondary");
    } catch (err) {
      const message = String(err);
      circuitOpened = message.includes("circuit-open");
      log.warn("secondary.fallback", { message, circuitOpened });
    }

    await kv.set(cacheKey, user, 10 * 60_000);

    return { source: "primary", user, circuitOpened };
  },
};

const base: Base = {
  requestId: crypto.randomUUID(),
  idempotencyKey: "request-123",
};

const first = await execute(step, {
  base,
  macros: stdMacros as any,
  env: policyEnv,
});

console.log("first run", first);

const second = await execute(step, {
  base,
  macros: stdMacros as any,
  env: policyEnv,
});

console.log("second run (idempotent)", second);
