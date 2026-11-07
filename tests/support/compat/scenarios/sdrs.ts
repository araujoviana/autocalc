import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "groups-5", input: { billing: "ondemand", protection_groups: 5, hours: 200 } },
  { name: "groups-100", input: { billing: "ondemand", protection_groups: 100, hours: 730 } },
];
