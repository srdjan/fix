import type { Meta } from "./types.ts";

type MetaBuilderMethods<M extends Partial<Meta>> = {
  withHttp(baseUrl?: string, auth?: "bearer" | "none"): MetaBuilder<
    M & { http: { baseUrl?: string; auth?: "bearer" | "none" } }
  >;
  withKv(namespace: string): MetaBuilder<M & { kv: { namespace: string } }>;
  withDb(
    role: "ro" | "rw",
    tx?: "required" | "new" | "none",
  ): MetaBuilder<
    M & { db: { role: "ro" | "rw"; tx?: "required" | "new" | "none" } }
  >;
  withQueue(name: string): MetaBuilder<M & { queue: { name: string } }>;
  withTime(): MetaBuilder<M & { time: Record<string, never> }>;
  withCrypto(opts?: {
    uuid?: true;
    hash?: "sha256" | "none";
  }): MetaBuilder<
    M & { crypto: { uuid?: true; hash?: "sha256" | "none" } }
  >;
  withLog(
    level: "debug" | "info" | "warn" | "error",
  ): MetaBuilder<M & { log: { level: "debug" | "info" | "warn" | "error" } }>;
  withFs(opts?: {
    tempDir?: true;
    workDirPrefix?: string;
  }): MetaBuilder<
    M & { fs: { tempDir?: true; workDirPrefix?: string } }
  >;
  withLock(opts?: {
    key?: string;
    mode?: "exclusive" | "shared";
    ttlMs?: number;
  }): MetaBuilder<
    M & {
      lock: { key?: string; mode?: "exclusive" | "shared"; ttlMs?: number };
    }
  >;
  withSocket(opts?: {
    host?: string;
    port?: number;
  }): MetaBuilder<M & { socket: { host?: string; port?: number } }>;
  withRetry(
    times: number,
    delayMs: number,
    jitter?: boolean,
  ): MetaBuilder<
    M & { retry: { times: number; delayMs: number; jitter?: boolean } }
  >;
  withTimeout(opts?: {
    ms?: number;
    acquireMs?: number;
  }): MetaBuilder<M & { timeout: { ms?: number; acquireMs?: number } }>;
  withIdempotency(
    key: string,
    ttlMs?: number,
  ): MetaBuilder<M & { idempotency: { key: string; ttlMs?: number } }>;
  withCircuit(
    name: string,
    halfOpenAfterMs?: number,
  ): MetaBuilder<M & { circuit: { name: string; halfOpenAfterMs?: number } }>;
  build(): M & Meta;
};

// deno-lint-ignore ban-types
export type MetaBuilder<M extends Partial<Meta> = {}> =
  & MetaBuilderMethods<M>
  & (M & Meta);

const createMetaBuilder = <M extends Partial<Meta>>(
  metaState: M,
): MetaBuilder<M> => {
  const buildNext = <Extra extends Partial<Meta>>(
    extra: Extra,
  ): MetaBuilder<M & Extra> =>
    createMetaBuilder(
      {
        ...metaState,
        ...extra,
      } as M & Extra,
    );

  const base: Record<string, unknown> = { ...metaState };

  const define = <K extends keyof MetaBuilderMethods<M>>(
    key: K,
    value: MetaBuilderMethods<M>[K],
  ) => {
    Object.defineProperty(base, key, {
      value,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  };

  define(
    "withHttp",
    (baseUrl?: string, auth?: "bearer" | "none") =>
      buildNext({ http: { baseUrl, auth } }),
  );
  define("withKv", (namespace: string) => buildNext({ kv: { namespace } }));
  define(
    "withDb",
    (role: "ro" | "rw", tx?: "required" | "new" | "none") =>
      buildNext({ db: { role, tx } }),
  );
  define("withQueue", (name: string) => buildNext({ queue: { name } }));
  define("withTime", () => buildNext({ time: {} }));
  define(
    "withCrypto",
    (opts?: { uuid?: true; hash?: "sha256" | "none" }) =>
      buildNext({ crypto: opts ?? {} }),
  );
  define(
    "withLog",
    (level: "debug" | "info" | "warn" | "error") =>
      buildNext({ log: { level } }),
  );
  define(
    "withFs",
    (opts?: { tempDir?: true; workDirPrefix?: string }) =>
      buildNext({ fs: opts ?? {} }),
  );
  define("withLock", (opts?: {
    key?: string;
    mode?: "exclusive" | "shared";
    ttlMs?: number;
  }) => buildNext({ lock: opts ?? {} }));
  define(
    "withSocket",
    (opts?: { host?: string; port?: number }) =>
      buildNext({ socket: opts ?? {} }),
  );
  define(
    "withRetry",
    (times: number, delayMs: number, jitter?: boolean) =>
      buildNext({ retry: { times, delayMs, jitter } }),
  );
  define(
    "withTimeout",
    (opts?: { ms?: number; acquireMs?: number }) =>
      buildNext({ timeout: opts ?? {} }),
  );
  define(
    "withIdempotency",
    (key: string, ttlMs?: number) => buildNext({ idempotency: { key, ttlMs } }),
  );
  define(
    "withCircuit",
    (name: string, halfOpenAfterMs?: number) =>
      buildNext({ circuit: { name, halfOpenAfterMs } }),
  );
  define("build", () => metaState as M & Meta);

  return base as MetaBuilder<M>;
};

// deno-lint-ignore ban-types
export const meta = (): MetaBuilder<{}> => createMetaBuilder({});

export const mergeMeta = <M1 extends Meta, M2 extends Meta>(
  m1: M1,
  m2: M2,
): M1 & M2 => ({ ...m1, ...m2 });

export const extendMeta = <M extends Meta, E extends Partial<Meta>>(
  base: M,
  extension: E,
): M & E => ({ ...base, ...extension });
