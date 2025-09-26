type Assert = (condition: unknown, message?: string) => void;

const assert: Assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = <T>(actual: T, expected: T, message?: string) => {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, received ${actual}`);
  }
};

const assertRejects = async (
  fn: () => Promise<unknown>,
  message = "Expected the promise to reject",
) => {
  let rejected = false;
  try {
    await fn();
  } catch (_err) {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(message);
  }
};

import { weave } from "./weave.ts";
import type { Meta } from "./types.ts";

Deno.test("lease acquire timeout releases late resources", async () => {
  let releaseCount = 0;

  const lease = {
    tempDir: async () => {
      await new Promise((res) => setTimeout(res, 10));
      return {
        value: { path: "temp" },
        release: async () => {
          releaseCount++;
        },
      };
    },
  };

  const meta = {
    fs: { tempDir: true },
    timeout: { acquireMs: 1 },
  } satisfies Meta;

  const decorated = weave(meta, { lease } as any);

  await assertRejects(() => decorated.lease.tempDir());

  await new Promise((res) => setTimeout(res, 20));

  assertEquals(releaseCount, 1, "expected delayed release to run once");
});

Deno.test("lease acquire emits structured logs", async () => {
  const messages: Array<{ level: string; message: string }> = [];

  const log = {
    level: "debug" as const,
    debug: (message: string) => messages.push({ level: "debug", message }),
    info: () => {},
    warn: () => {},
    error: (message: string) => messages.push({ level: "error", message }),
  };

  const lease = {
    tempDir: async () => ({
      value: { path: "temp" },
      release: async () => {},
    }),
  };

  const meta = {
    fs: { tempDir: true },
    log: { level: "debug" },
  } satisfies Meta;

  const decorated = weave(meta, { lease, log } as any);

  await decorated.lease.tempDir("demo-");

  assert(
    messages.some(({ message }) => message === "lease.tempDir.acquire ok"),
    "expected success log for lease acquisition",
  );
});

Deno.test("lease retry honours jitter", async () => {
  const recorded: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalRandom = Math.random;

  Math.random = () => 0;
  globalThis.setTimeout =
    ((handler: (...handlerArgs: any[]) => void, ms = 0, ...args: any[]) => {
      recorded.push(ms);
      return originalSetTimeout(() => handler(...args), 0);
    }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof originalSetTimeout>) => {
    return originalClearTimeout(id);
  }) as typeof globalThis.clearTimeout;

  try {
    let attempts = 0;
    const lease = {
      lock: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("boom");
        }
        return {
          value: { key: "k" },
          release: async () => {},
        };
      },
    };

    const meta = {
      lock: { mode: "exclusive" },
      retry: { times: 1, delayMs: 10, jitter: true },
    } satisfies Meta;

    const decorated = weave(meta, { lease } as any);

    await decorated.lease.lock("k", "exclusive");

    const jitterDelays = recorded.filter((ms) => ms > 0);
    assert(
      jitterDelays.some((ms) => ms === 5),
      "expected jittered delay to be applied to lease retries",
    );
  } finally {
    Math.random = originalRandom;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
