import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "default", input: { billing: "ondemand" } },
  { name: "ips-1", input: { billing: "ondemand", public_ip_count: 1, hours: 400 } },
  { name: "monthly", input: { billing: "monthly", periods: 2 } },
  { name: "yearly", input: { billing: "yearly" } },
];
export const notes = ["Dedicated load balancers (`elbv3.*`, 1-4 AZ basic and professional, LCU billing): in the catalog and on the page, not built yet."];
