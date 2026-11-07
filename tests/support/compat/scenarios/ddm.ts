import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-c6-8xlarge",
    input: {
      billing: "ondemand",
      spec_type: "dataInfo_4_",
      spec: "32dataInfo_3_dataInfo_2_64BSSUNIT.pluralUnit.17",
    },
  },
  {
    name: "monthly-c6-8xlarge",
    input: {
      billing: "monthly",
      spec_type: "dataInfo_4_",
      spec: "32dataInfo_3_dataInfo_2_64BSSUNIT.pluralUnit.17",
      periods: 2,
      quantity: 2,
    },
  },
  {
    name: "yearly-c6-8xlarge",
    input: {
      billing: "yearly",
      spec_type: "dataInfo_4_",
      spec: "32dataInfo_3_dataInfo_2_64BSSUNIT.pluralUnit.17",
      periods: 1,
    },
  },
];
