import { allSteps, defineStep, execute } from "../../packages/core/mod.ts";
import { stdMacros } from "../../packages/std/mod.ts";
import { hostNodeEnv } from "../../packages/host-node/mod.ts";
import type { Meta } from "../../packages/core/types.ts";

type Base = { userId: string };

const fetchUserData = defineStep<Base>()({
  name: "fetch-user-data",
  meta: {
    db: { role: "ro" },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ userId, log }) {
    log.info("fetching.user.data", { userId });
    return { id: userId, name: "Ada" };
  },
});

const fetchOrders = defineStep<Base>()({
  name: "fetch-orders",
  meta: {
    db: { role: "ro" },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ userId, log }) {
    log.info("fetching.orders", { userId });
    return [{ orderId: "o1", total: 100 }, { orderId: "o2", total: 200 }];
  },
});

const fetchRecommendations = defineStep<Base>()({
  name: "fetch-recommendations",
  meta: {
    http: { baseUrl: "https://api.example.com" },
    log: { level: "debug" },
  } satisfies Meta,
  async run({ userId, log }) {
    log.info("fetching.recommendations", { userId });
    return ["item1", "item2", "item3"];
  },
});

const parallelFetch = allSteps<Base>()(
  fetchUserData,
  fetchOrders,
  fetchRecommendations,
);

console.log("\n=== Running Parallel Execution Example ===\n");

const [userData, orders, recommendations] = await execute(parallelFetch, {
  base: { userId: "456" },
  macros: stdMacros as any,
  env: hostNodeEnv,
});

console.log("User:", userData);
console.log("Orders:", orders);
console.log("Recommendations:", recommendations);