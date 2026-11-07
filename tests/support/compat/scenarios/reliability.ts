import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand", input: { billing: "ondemand" } },
  { name: "monthly", input: { billing: "monthly", periods: 1, quantity: 2 } },
  { name: "yearly", input: { billing: "yearly", periods: 1, quantity: 1 } },
];
