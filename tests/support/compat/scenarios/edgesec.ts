import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "monthly", input: { billing: "monthly", periods: 1 } },
];
