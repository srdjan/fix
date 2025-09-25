import type { Releasable } from "../ports/mod.ts";

// Host is injected; for demo, we receive simple fs helpers via env
export type FsHost = {
  mkdtemp(prefix?: string): Promise<string>;
  rm(path: string, opts?: { recursive?: boolean }): Promise<void>;
};

export function tempDirOp(host: FsHost) {
  return async function acquire(prefix = "tmp-"): Promise<Releasable<{ path: string }>> {
    const path = await host.mkdtemp(prefix);
    return {
      value: { path },
      release: async () => { await host.rm(path, { recursive: true }); }
    };
  };
}
