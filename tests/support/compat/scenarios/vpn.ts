import type { Scenario } from "../replay.ts";
const o = { eip1_mbps: 20, eip2_mbps: 30, spec: "dataInfo_300_", connection_groups: 20 };
export const scenarios: Scenario[] = [
  { name: "monthly-300", input: { billing: "monthly", ...o, periods: 2 } },
  { name: "yearly-1000", input: { billing: "yearly", ...o, spec: "dataInfo_1000_", connection_groups: 40 } },
  { name: "ondemand-300", input: { billing: "ondemand", ...o, hours: 400 } },
];
