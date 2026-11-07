import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-ha-small", input: { billing: "ondemand", cluster_type: "standard", ha: true, scale: "small", hours: 400 } },
  { name: "monthly-ha-small", input: { billing: "monthly", cluster_type: "standard", ha: true, scale: "small", periods: 2 } },
  { name: "yearly-ha-small", input: { billing: "yearly", cluster_type: "standard", ha: true, scale: "small", periods: 1 } },
  { name: "ondemand-single-medium", input: { billing: "ondemand", cluster_type: "standard", ha: false, scale: "medium", hours: 730 } },
];
