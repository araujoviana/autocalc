import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "monthly-premium", input: { billing: "monthly", edition: "dataInfo_4_", periods: 2, quantity: 3 } },
  { name: "yearly-wtp", input: { billing: "yearly", edition: "dataInfo_3_", periods: 1, quantity: 5 } },
  { name: "ondemand-premium", input: { billing: "ondemand", edition: "dataInfo_4_" } },
];
