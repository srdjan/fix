export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export function withJitter(delay: number): number {
  const r = Math.random();
  return Math.round(delay * (0.5 + r)); // [0.5x, 1.5x]
}

// Generic method wrapper utility
export function wrapMethods<T extends object>(obj: T, wrap: (fn: Function, key: string) => Function): T {
  const out: any = {};
  for (const key of Object.keys(obj)) {
    const val: any = (obj as any)[key];
    out[key] = typeof val === "function" ? wrap(val, key) : val;
  }
  return out;
}
