import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "monthly-standard", input: { billing: "monthly", edition: "detail_3_", bandwidth_mbps: 20, eips: 10, periods: 2 } },
  { name: "yearly-standard", input: { billing: "yearly", edition: "detail_3_", bandwidth_mbps: 50, eips: 20, periods: 1 } },
  { name: "ondemand-professional", input: { billing: "ondemand", edition: "detail_11_" } },
];
