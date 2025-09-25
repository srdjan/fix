export function fakeLogger() {
  const logs: any[] = [];
  return {
    logs,
    logger: {
      level: "debug",
      debug: (m: string, d?: unknown) => logs.push(["debug", m, d]),
      info: (m: string, d?: unknown) => logs.push(["info", m, d]),
      warn: (m: string, d?: unknown) => logs.push(["warn", m, d]),
      error: (m: string, d?: unknown) => logs.push(["error", m, d]),
    },
  };
}
