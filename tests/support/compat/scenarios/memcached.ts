import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-single-8gb", input: { billing: "ondemand", instance_type: "calc_5_", memory_gb: 8, hours: 400 } },
  { name: "ondemand-ha-16gb", input: { billing: "ondemand", instance_type: "calc_6_", memory_gb: 16, hours: 730, quantity: 2 } },
];
