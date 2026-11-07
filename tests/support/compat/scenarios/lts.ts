import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-cold-storage",
    input: {
      billing: "ondemand",
      flow_gb: 5.51171875,
      index_gb: 29.51171875,
      cold_mb: 43200,
      storage_mb: 21248.4375,
      transfer_basic_gb: 60,
      transfer_senior_gb: 60,
      knobs: { flow: 1, index_rate: 100, storage: 90, hot: 30, basic: 2, senior: 2 },
    },
  },
];
