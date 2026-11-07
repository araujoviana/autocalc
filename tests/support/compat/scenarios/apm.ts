import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-normal", input: { billing: "ondemand", spec: "apm2.instance.normal", hours: 400 } },
  { name: "ondemand-normal-full", input: { billing: "ondemand", spec: "apm2.instance.normal", hours: 730 } },
];
