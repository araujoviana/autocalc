import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-2u4g", input: { billing: "ondemand", vcpu: 2, mem_gb: 4, hours: 300 } },
  { name: "ondemand-4u8g", input: { billing: "ondemand", vcpu: 4, mem_gb: 8, hours: 730 } },
];
