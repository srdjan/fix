import type { Releasable } from "../ports/mod.ts";

export async function bracket<T, R>(
  acquire: () => Promise<Releasable<T>>,
  use: (t: T) => Promise<R>,
  finalizer?: (t: T) => Promise<void>
): Promise<R> {
  const { value, release } = await acquire();
  try {
    return await use(value);
  } finally {
    try {
      if (finalizer) await finalizer(value);
      await release();
    } catch {
      // swallow
    }
  }
}
