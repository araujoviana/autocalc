import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "yearly-type2", input: { billing: "yearly", type: "detail_2_", capacity: "27.200 TB", periods: 2 } },
  { name: "yearly-type3", input: { billing: "yearly", type: "detail_3_", capacity: "43.350 TB", periods: 1 } },
];
