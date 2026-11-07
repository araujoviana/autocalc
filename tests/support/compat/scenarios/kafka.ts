import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-single-small", input: { billing: "ondemand", spec_id: "kafka.2u4g.single.small", brokers: 1, storage_gb: 100, hours: 400 } },
  { name: "monthly-cluster-c6", input: { billing: "monthly", spec_id: "c6.2u4g.cluster", brokers: 3, storage_gb: 200, periods: 2 } },
  { name: "yearly-cluster-c6", input: { billing: "yearly", spec_id: "c6.4u8g.cluster", brokers: 3, storage_gb: 300, periods: 1 } },
];
