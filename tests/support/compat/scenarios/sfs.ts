import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "ondemand", input: { billing: "ondemand", capacity_gb: 500, hours: 300 } },
  { name: "ondemand-large", input: { billing: "ondemand", capacity_gb: 12000, hours: 730 } },
];
export const notes = ["Monthly and yearly SFS (capacity radio `storageSizeSpec`): offered by the page, not built."];
