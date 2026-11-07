import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "hours-300", input: { billing: "ondemand", duration_hours: 300 } },
  { name: "hours-730", input: { billing: "ondemand", duration_hours: 730 } },
];
