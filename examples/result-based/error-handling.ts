import { defineStep, execute } from "../../packages/core/mod.ts";
import { withResult } from "../../packages/core/compose.ts";
import {
  err,
  isErr,
  isOk,
  map,
  matchResult,
  ok,
  type Result,
} from "../../packages/core/result.ts";
import { stdMacros } from "../../packages/std/mod.ts";
import { hostNodeEnv } from "../../packages/host-node/mod.ts";
import type { Meta } from "../../packages/core/types.ts";

type Base = { userId: string };

type FetchError = "NOT_FOUND" | "NETWORK_ERROR" | "TIMEOUT";

const riskyFetchStep = defineStep<Base>()({
  name: "risky-fetch",
  meta: {
    db: { role: "ro" },
    log: { level: "info" },
  } satisfies Meta,
  async run({ userId, log }) {
    log.info("attempting.risky.fetch", { userId });

    if (userId === "missing") {
      throw new Error("NOT_FOUND");
    }

    return { id: userId, name: "Ada", status: "active" };
  },
});

console.log("\n=== Running Result-Based Error Handling (Success) ===\n");

const successStep = withResult<Base>()(riskyFetchStep);

const successResult = await execute(successStep, {
  base: { userId: "123" },
  macros: stdMacros as any,
  env: hostNodeEnv,
});

matchResult(
  successResult,
  (data) => console.log("✓ Success:", data),
  (error) => console.error("✗ Error:", error.message),
);

console.log("\n=== Running Result-Based Error Handling (Failure) ===\n");

const failureStep = withResult<Base>()(riskyFetchStep);

const failureResult = await execute(failureStep, {
  base: { userId: "missing" },
  macros: stdMacros as any,
  env: hostNodeEnv,
});

matchResult(
  failureResult,
  (data) => console.log("✓ Success:", data),
  (error) => console.error("✗ Error:", error.message),
);

console.log("\n=== Using Result Combinators ===\n");

const transformResult = map(
  successResult,
  (user) => ({ ...user, displayName: `${user.name} (${user.id})` }),
);

if (isOk(transformResult)) {
  console.log("Transformed:", transformResult.value);
}

const getUserName = (result: Result<{ name: string }, Error>): string => {
  return matchResult(
    result,
    (user) => user.name,
    (_error) => "Unknown User",
  );
};

console.log(
  "User name from success:",
  getUserName(successResult as Result<{ name: string }, Error>),
);
console.log(
  "User name from failure:",
  getUserName(failureResult as Result<{ name: string }, Error>),
);