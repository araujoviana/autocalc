import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-basic", input: { billing: "ondemand", edition: "BASIC", hours: 400 } },
  { name: "ondemand-basic-full", input: { billing: "ondemand", edition: "BASIC", hours: 730 } },
];
