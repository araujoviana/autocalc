import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "monthly", input: { billing: "monthly", periods: 1 } },
  { name: "yearly", input: { billing: "yearly", periods: 1 } },
  { name: "ondemand", input: { billing: "ondemand", hours: 730 } },
];
