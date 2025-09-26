import { brandLease, type Lease, type Releasable } from "../ports/mod.ts";

// Host is injected; for demo, we receive simple fs helpers via env
export type FsHost = {
  mkdtemp(prefix?: string): Promise<string>;
  rm(path: string, opts?: { recursive?: boolean }): Promise<void>;
};

export function tempDirOp<Scope>(host: FsHost) {
  return async function acquire(
    prefix = "tmp-",
  ): Promise<Releasable<Lease<{ path: string }, Scope>>> {
    const path = await host.mkdtemp(prefix);
    const lease = brandLease<{ path: string }, Scope>({ path });
    return {
      value: lease,
      release: async () => {
        await host.rm(path, { recursive: true });
      },
    };
  };
}
