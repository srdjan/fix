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

type MaybeReleasable = { release?: () => Promise<void> };

function withAcquireTimeout(
  acquire: (...args: any[]) => Promise<MaybeReleasable>,
  ms: number,
): (...args: any[]) => Promise<MaybeReleasable> {
  return async (...args: any[]) => {
    const timeoutError = new Error("acquire-timeout");
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const acquirePromise = Promise.resolve(acquire(...args));

    acquirePromise.then(
      async (res) => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        if (timedOut && res && typeof res.release === "function") {
          try {
            await res.release();
          } catch {
            // swallow release failures after timeout
          }
        }
      },
      () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
      },
    );

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(timeoutError);
      }, ms);
    });

    return await Promise.race([
      acquirePromise,
      timeoutPromise,
    ]) as MaybeReleasable;
  };
}

function wrapAcquire(
  fn: (...args: any[]) => Promise<MaybeReleasable>,
  label: string,
  opts: {
    log?: any;
    timeout?: Meta["timeout"];
    retry?: Meta["retry"];
    circuit?: Meta["circuit"];
    getCircuit?: CircuitProvider;
  },
): (...args: any[]) => Promise<MaybeReleasable> {
  let acquire = (...args: any[]) => fn(...args);

  if (opts.timeout?.acquireMs) {
    acquire = withAcquireTimeout(acquire, opts.timeout.acquireMs);
  }

  if (opts.circuit) {
    const wrapped = wrapCircuit(
      { acquire } as { acquire: typeof acquire },
      opts.circuit,
      opts.log,
      label,
      opts.getCircuit,
    );
    acquire = wrapped.acquire;
  }

  if (opts.log) {
    const wrapped = wrapLog(
      { acquire } as { acquire: typeof acquire },
      opts.log,
      label,
    );
    acquire = wrapped.acquire;
  }

  if (opts.retry) {
    const wrapped = wrapRetry(
      { acquire } as { acquire: typeof acquire },
      opts.retry,
    );
    acquire = wrapped.acquire;
  }

  return (...args: any[]) => acquire(...args);
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
  if (out.lease) {
    const acquirePolicies = {
      log,
      timeout,
      retry,
      circuit,
      getCircuit: opts?.getCircuit,
    } as const;

    const wrapLeaseFn = <F extends (...args: any[]) => Promise<any>>(
      fn: F | undefined,
      label: string,
    ): F | undefined => {
      if (!fn) return undefined;
      return wrapAcquire(fn as any, label, acquirePolicies) as F;
    };

    out.lease = {
      ...out.lease,
      db: wrapLeaseFn(out.lease.db, "lease.db"),
      tx: out.lease.tx && (async (fn: any) => out.lease.tx(fn)), // tx itself has its own bracket
      tempDir: wrapLeaseFn(out.lease.tempDir, "lease.tempDir"),
      lock: wrapLeaseFn(out.lease.lock, "lease.lock"),
      socket: wrapLeaseFn(out.lease.socket, "lease.socket"),
    };
  }

  return out;
}
