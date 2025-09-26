// Type-only module with public port surfaces

export type HttpPort = {
  get(path: string, init?: RequestInit): Promise<Response>;
  post(path: string, body?: unknown, init?: RequestInit): Promise<Response>;
};

export type KvPort = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
};

export type DbPort = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

export type QueuePort = {
  enqueue<T>(msg: T): Promise<void>;
};

export type TimePort = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export type CryptoPort = {
  uuid(): string;
  hash(s: string, algo?: "sha256" | "none"): Promise<string>;
};

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogPort = {
  level: LogLevel;
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
};

// Resource leasing
declare const ScopeBrand: unique symbol;
const scopeBrandToken = Symbol.for("macrofx.scope");
const defaultScopeToken = Symbol.for("macrofx.scope-token");

export type Lease<T, Scope> = T & { readonly [ScopeBrand]: Scope };
export type Releasable<T> = { value: T; release: () => Promise<void> };

export function brandLease<T extends object, Scope>(
  value: T,
  token: symbol = defaultScopeToken,
): Lease<T, Scope> {
  if (!Object.prototype.hasOwnProperty.call(value, scopeBrandToken)) {
    Object.defineProperty(value, scopeBrandToken, {
      value: token as unknown as Scope,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return value as Lease<T, Scope>;
}

export type LockHandle = { key: string };

export type Socket = {
  write: (buf: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

export type LeasePort<Scope> = {
  db(role: "ro" | "rw"): Promise<Releasable<Lease<DbPort, Scope>>>;
  tx<T>(fn: (db: Lease<DbPort, Scope>) => Promise<T>): Promise<T>;
  tempDir(prefix?: string): Promise<Releasable<Lease<{ path: string }, Scope>>>;
  lock(
    key: string,
    mode?: "exclusive" | "shared",
  ): Promise<Releasable<Lease<LockHandle, Scope>>>;
  socket(host: string, port: number): Promise<Releasable<Lease<Socket, Scope>>>;
};

export type Bracket = <T, R>(
  acquire: () => Promise<Releasable<T>>,
  use: (t: T) => Promise<R>,
  finalizer?: (t: T) => Promise<void>,
) => Promise<R>;
