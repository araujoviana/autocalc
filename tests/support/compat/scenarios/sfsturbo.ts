import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "yearly-default", input: { billing: "yearly" } },
  { name: "monthly-20", input: { billing: "monthly", tier: "20MBps", size_gb: 7372.8, periods: 2 } },
  { name: "ondemand-40", input: { billing: "ondemand", tier: "40MBps", size_gb: 3686.4, hours: 400 } },
  { name: "monthly-250", input: { billing: "monthly", tier: "250MBps", size_gb: 1228.8 } },
  { name: "monthly-125", input: { billing: "monthly", tier: "125MBps", size_gb: 2457.6 } },
];
