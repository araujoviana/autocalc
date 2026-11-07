import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "type-11", input: { billing: "ondemand", transfer_type: "calc_11_", devices: 3, quantity: 2 } },
  { name: "type-12", input: { billing: "ondemand", transfer_type: "calc_12_", quantity: 1 } },
];
