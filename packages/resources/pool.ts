// Tiny fair FIFO pool for demo purposes
type Factory<T> = () => Promise<T>;
type Destroy<T> = (t: T) => Promise<void>;

export function makePool<T>(factory: Factory<T>, destroy: Destroy<T>, max = 8) {
  const free: T[] = [];
  const waiters: ((v: T) => void)[] = [];
  let total = 0;

  async function acquire(): Promise<T> {
    if (free.length) return free.shift() as T;
    if (total < max) {
      total++;
      return await factory();
    }
    return await new Promise<T>((res) => waiters.push(res));
  }

  async function release(t: T) {
    if (waiters.length) {
      const w = waiters.shift()!;
      w(t);
    } else {
      free.push(t);
    }
  }

  async function drain() {
    for (const t of free) await destroy(t);
    free.length = 0;
  }

  return { acquire, release, drain };
}
