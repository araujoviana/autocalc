import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-single", input: { billing: "ondemand", spec_id: "c6.2u4g.single", brokers: 1, storage_gb: 100, hours: 400 } },
  { name: "monthly-cluster", input: { billing: "monthly", spec_id: "c6.2u4g.cluster", brokers: 3, storage_gb: 200, periods: 2 } },
  { name: "yearly-cluster", input: { billing: "yearly", spec_id: "c6.4u8g.cluster", brokers: 3, storage_gb: 300, periods: 1 } },
];
