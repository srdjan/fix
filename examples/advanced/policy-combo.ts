import { defineStep, type Meta } from "../../packages/core/mod.ts";
import { createStdEngine, stdEnv } from "../../packages/std/mod.ts";

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

const sharedKv = stdEnv.makeKv("policy-demo");

const policyEnv = {
  ...stdEnv,
  makeHttp: () => flakyHttp(),
  makeKv: () => sharedKv,
};

const step = defineStep<Base, symbol>()({
  name: "policy-combo",
  meta: {
    http: { baseUrl: "https://api.demo" },
    kv: { namespace: "policy-demo" },
    log: { level: "debug" },
    retry: { times: 2, delayMs: 20, jitter: false },
    timeout: { ms: 500 },
    idempotency: { key: "policy-demo" },
    circuit: { name: "primary-http", halfOpenAfterMs: 5_000 },
  } satisfies Meta,
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
});

const base: Base = {
  requestId: crypto.randomUUID(),
  idempotencyKey: "request-123",
};

const engine = createStdEngine<Base>({ env: policyEnv, validate: true });

const first = await engine.run(step, base);

console.log("first run", first);

const second = await engine.run(step, base);

console.log("second run (idempotent)", second);
