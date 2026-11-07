import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-large-3nodes", input: { billing: "ondemand", flavor: "large.4", nodes: 3, storage_gb: 200, hours: 400 } },
  { name: "monthly-xlarge-3nodes", input: { billing: "monthly", flavor: "xlarge.4", nodes: 3, storage_gb: 300, periods: 2 } },
  { name: "yearly-large-4nodes", input: { billing: "yearly", flavor: "large.4", nodes: 4, storage_gb: 400, periods: 1 } },
];
