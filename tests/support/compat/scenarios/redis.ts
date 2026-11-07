import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-single-4g", input: { billing: "ondemand", spec: "redis.single.xu1.large.4", hours: 400 } },
  { name: "monthly-ha-8g", input: { billing: "monthly", spec: "redis.ha.xu1.large.r2.8", periods: 2, quantity: 2 } },
  { name: "yearly-cluster-16g", input: { billing: "yearly", spec: "redis.cluster.xu1.large.r2.16", periods: 1 } },
];
