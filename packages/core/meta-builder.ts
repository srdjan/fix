import type { Meta } from "./types.ts";

export type MetaBuilder<M extends Partial<Meta> = {}> = {
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
  withTime(): MetaBuilder<M & { time: {} }>;
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
    M & { lock: { key?: string; mode?: "exclusive" | "shared"; ttlMs?: number } }
  >;
  withSocket(opts?: {
    host?: string;
    port?: number;
  }): MetaBuilder<M & { socket: { host?: string; port?: number } }>;
  withRetry(
    times: number,
    delayMs: number,
    jitter?: boolean,
  ): MetaBuilder<M & { retry: { times: number; delayMs: number; jitter?: boolean } }>;
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

class MetaBuilderImpl<M extends Partial<Meta>> implements MetaBuilder<M> {
  constructor(private readonly meta: M) {}

  withHttp(baseUrl?: string, auth?: "bearer" | "none") {
    return new MetaBuilderImpl({
      ...this.meta,
      http: { baseUrl, auth },
    } as any);
  }

  withKv(namespace: string) {
    return new MetaBuilderImpl({
      ...this.meta,
      kv: { namespace },
    } as any);
  }

  withDb(role: "ro" | "rw", tx?: "required" | "new" | "none") {
    return new MetaBuilderImpl({
      ...this.meta,
      db: { role, tx },
    } as any);
  }

  withQueue(name: string) {
    return new MetaBuilderImpl({
      ...this.meta,
      queue: { name },
    } as any);
  }

  withTime() {
    return new MetaBuilderImpl({
      ...this.meta,
      time: {},
    } as any);
  }

  withCrypto(opts?: { uuid?: true; hash?: "sha256" | "none" }) {
    return new MetaBuilderImpl({
      ...this.meta,
      crypto: opts ?? {},
    } as any);
  }

  withLog(level: "debug" | "info" | "warn" | "error") {
    return new MetaBuilderImpl({
      ...this.meta,
      log: { level },
    } as any);
  }

  withFs(opts?: { tempDir?: true; workDirPrefix?: string }) {
    return new MetaBuilderImpl({
      ...this.meta,
      fs: opts ?? {},
    } as any);
  }

  withLock(opts?: {
    key?: string;
    mode?: "exclusive" | "shared";
    ttlMs?: number;
  }) {
    return new MetaBuilderImpl({
      ...this.meta,
      lock: opts ?? {},
    } as any);
  }

  withSocket(opts?: { host?: string; port?: number }) {
    return new MetaBuilderImpl({
      ...this.meta,
      socket: opts ?? {},
    } as any);
  }

  withRetry(times: number, delayMs: number, jitter?: boolean) {
    return new MetaBuilderImpl({
      ...this.meta,
      retry: { times, delayMs, jitter },
    } as any);
  }

  withTimeout(opts?: { ms?: number; acquireMs?: number }) {
    return new MetaBuilderImpl({
      ...this.meta,
      timeout: opts ?? {},
    } as any);
  }

  withIdempotency(key: string, ttlMs?: number) {
    return new MetaBuilderImpl({
      ...this.meta,
      idempotency: { key, ttlMs },
    } as any);
  }

  withCircuit(name: string, halfOpenAfterMs?: number) {
    return new MetaBuilderImpl({
      ...this.meta,
      circuit: { name, halfOpenAfterMs },
    } as any);
  }

  build(): M & Meta {
    return this.meta as M & Meta;
  }
}

export const meta = (): MetaBuilder<{}> => new MetaBuilderImpl({});

export const mergeMeta = <M1 extends Meta, M2 extends Meta>(
  m1: M1,
  m2: M2,
): M1 & M2 => ({ ...m1, ...m2 });

export const extendMeta = <M extends Meta, E extends Partial<Meta>>(
  base: M,
  extension: E,
): M & E => ({ ...base, ...extension });