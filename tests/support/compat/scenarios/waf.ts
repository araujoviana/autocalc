import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-default", input: { billing: "ondemand", domains: 2, rules: 3, requests: 2000000, hours: 400 } },
  { name: "ondemand-5m-requests", input: { billing: "ondemand", domains: 5, rules: 10, requests: 5000000, hours: 730 } },
];
