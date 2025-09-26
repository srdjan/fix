import { sleep, withJitter, wrapMethods } from "./utils.ts";
import type { CircuitProvider, CircuitState, Meta } from "./types.ts";

function wrapRetry<T extends object>(
  port: T,
  policy: NonNullable<Meta["retry"]>,
): T {
  const { times, delayMs, jitter } = policy;
  return wrapMethods(
    port,
    (fn) =>
      async function wrapped(this: any, ...args: any[]) {
        let attempt = 0;
        let lastErr: unknown;
        while (attempt <= times) {
          try {
            return await fn.apply(this, args);
          } catch (e) {
            lastErr = e;
            const delay = jitter ? withJitter(delayMs) : delayMs;
            await sleep(delay);
            attempt++;
          }
        }
        throw lastErr;
      },
  ) as T;
}

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label = "timeout",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function wrapTimeout<T extends object>(
  port: T,
  policy: NonNullable<Meta["timeout"]>,
): T {
  const ms = policy.ms ?? 0;
  if (!ms) return port;
  return wrapMethods(port, (fn) =>
    function wrapped(this: any, ...args: any[]) {
      const p = Promise.resolve(fn.apply(this, args));
      return withTimeout(p, ms, "effect-timeout");
    }) as T;
}

function getCircuitState(
  label: string,
  policy: NonNullable<Meta["circuit"]>,
  provider?: CircuitProvider,
): CircuitState {
  return provider?.(policy.name ?? label, policy) ?? { openUntil: 0 };
}

function wrapCircuit<T extends object>(
  port: T,
  policy: NonNullable<Meta["circuit"]>,
  logger: any,
  family: string,
  provider?: CircuitProvider,
): T {
  const cooldown = policy.halfOpenAfterMs ?? 30_000;
  const state = getCircuitState(family, policy, provider);
  const circuitKey = policy.name ?? family;
  return wrapMethods(
    port,
    (fn, key) =>
      async function wrapped(this: any, ...args: any[]) {
        const now = Date.now();
        const openUntil = state.openUntil ?? 0;
        if (now < openUntil) {
          const remaining = openUntil - now;
          logger?.warn?.(`${family}.${String(key)} circuit-open`, {
            remainingMs: remaining,
            circuit: circuitKey,
          });
          throw new Error("circuit-open");
        }
        try {
          const out = await fn.apply(this, args);
          state.openUntil = 0;
          return out;
        } catch (e) {
          state.openUntil = Date.now() + cooldown;
          logger?.warn?.(`${family}.${String(key)} circuit-trip`, {
            cooldownMs: cooldown,
            circuit: circuitKey,
            error: String(e),
          });
          throw e;
        }
      },
  ) as T;
}

function wrapLog<T extends object>(port: T, logger: any, family: string): T {
  return wrapMethods(
    port,
    (fn, key) =>
      async function wrapped(this: any, ...args: any[]) {
        const start = Date.now();
        try {
          const res = await fn.apply(this, args);
          logger?.debug?.(`${family}.${String(key)} ok`, {
            ms: Date.now() - start,
          });
          return res;
        } catch (e) {
          logger?.error?.(`${family}.${String(key)} err`, {
            ms: Date.now() - start,
            e: String(e),
          });
          throw e;
        }
      },
  ) as T;
}

export function weave(
  meta: Meta,
  caps: any,
  opts?: { getCircuit?: CircuitProvider },
): any {
  let out = { ...caps };
  const retry = meta.retry;
  const timeout = meta.timeout;
  const log = caps.log;
  const circuit = meta.circuit;

  const wrapPort = (k: string) => {
    if (!out[k]) return;
    let p = out[k];
    if (circuit) p = wrapCircuit(p, circuit, log, k, opts?.getCircuit);
    if (log) p = wrapLog(p, log, k);
    if (retry) p = wrapRetry(p, retry);
    if (timeout?.ms) p = wrapTimeout(p, timeout);
    out[k] = p;
  };

  // effect ports
  wrapPort("http");
  wrapPort("kv");
  wrapPort("db");
  wrapPort("queue");

  // resource openers: only apply acquire timeout/retry wrappers
  const wrapAcquire = (fn: Function, label: string) => {
    let baseAcquire = async (...args: any[]) => await fn(...args);

    if (meta.timeout?.acquireMs) {
      const ms = meta.timeout.acquireMs;
      const original = baseAcquire;
      baseAcquire = (...args: any[]) =>
        withTimeout(Promise.resolve(original(...args)), ms, "acquire-timeout");
    }

    if (circuit) {
      const wrapped = wrapCircuit(
        { acquire: baseAcquire } as any,
        circuit,
        log,
        label,
        opts?.getCircuit,
      );
      baseAcquire = (...args: any[]) => wrapped.acquire(...args);
    }

    if (!retry) {
      return baseAcquire;
    }

    return async (...args: any[]) => {
      let attempt = 0, lastErr: unknown;
      while (attempt <= retry.times) {
        try {
          return await baseAcquire(...args);
        } catch (e) {
          lastErr = e;
          await sleep(retry.delayMs);
          attempt++;
        }
      }
      throw lastErr;
    };
  };

  if (out.lease) {
    out.lease = {
      ...out.lease,
      db: out.lease.db &&
        ((role: "ro" | "rw") => wrapAcquire(out.lease.db, "lease.db")(role)),
      tx: out.lease.tx && (async (fn: any) => out.lease.tx(fn)), // tx itself has its own bracket
      tempDir: out.lease.tempDir &&
        ((prefix?: string) =>
          wrapAcquire(out.lease.tempDir, "lease.tempDir")(prefix)),
      lock: out.lease.lock &&
        ((key: string, mode?: string) =>
          wrapAcquire(out.lease.lock, "lease.lock")(key, mode)),
      socket: out.lease.socket &&
        ((host: string, port: number) =>
          wrapAcquire(out.lease.socket, "lease.socket")(host, port)),
    };
  }

  return out;
}
