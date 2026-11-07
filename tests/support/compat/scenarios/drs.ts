import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-sync",
    input: {
      billing: "ondemand",
      type: "dataInfo_2_",
      flow: "dataInfo_4_",
      specification: "dataInfo_38_",
    },
  },
  {
    name: "monthly-dr",
    input: {
      billing: "monthly",
      type: "dataInfo_3_",
      flow: "dataInfo_6_",
      specification: "dataInfo_35_",
      periods: 2,
      quantity: 2,
    },
  },
  {
    name: "yearly-dr",
    input: {
      billing: "yearly",
      type: "dataInfo_3_",
      flow: "dataInfo_6_",
      specification: "dataInfo_35_",
      periods: 1,
    },
  },
];
