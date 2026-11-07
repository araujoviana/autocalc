import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-ha",
    input: {
      billing: "ondemand",
      instance_type: "dataInfo_1_",
      db_version: "dataInfo_15_",
      public_type: "dataInfo_20_",
      spec: "2dataInfo_12_dataInfo_8_4BSSUNIT.pluralUnit.17dataInfo_13_",
      storage_gb: 200,
    },
  },
  {
    name: "monthly-ha",
    input: {
      billing: "monthly",
      instance_type: "dataInfo_1_",
      db_version: "dataInfo_15_",
      public_type: "dataInfo_20_",
      spec: "8dataInfo_12_dataInfo_8_64BSSUNIT.pluralUnit.17dataInfo_13_",
      storage_gb: 300,
      periods: 2,
      quantity: 2,
    },
  },
  {
    name: "yearly-ha",
    input: {
      billing: "yearly",
      instance_type: "dataInfo_1_",
      db_version: "dataInfo_15_",
      public_type: "dataInfo_20_",
      spec: "8dataInfo_12_dataInfo_8_64BSSUNIT.pluralUnit.17dataInfo_13_",
      storage_gb: 400,
      periods: 1,
    },
  },
];
