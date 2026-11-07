import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-kms", input: { billing: "ondemand", storage_spec: "kms.ud.customer", api_spec: "kms.api", keys: 5, api_requests: 50, hours: 400 } },
  { name: "ondemand-csms", input: { billing: "ondemand", storage_spec: "csms.secret.storage", api_spec: "csms.secret.api", keys: 10, api_requests: 100, days: 30 } },
];
