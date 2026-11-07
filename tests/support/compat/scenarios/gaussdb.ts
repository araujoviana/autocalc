import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-ha-4u16g",
    input: {
      billing: "ondemand",
      deploy_model: "dataInfo_25_",
      instance_type: "dataInfo_24_",
      db_version: "dataInfo_27_",
      database_type: "dataInfo_30_",
      public_type: "dataInfo_15_",
      spec: "4dataInfo_7_dataInfo_11_16BSSUNIT.pluralUnit.17",
      storage_gb: 200,
    },
  },
  {
    name: "monthly-ha-32u128g",
    input: {
      billing: "monthly",
      deploy_model: "dataInfo_25_",
      instance_type: "dataInfo_24_",
      db_version: "dataInfo_26_",
      database_type: "dataInfo_30_",
      public_type: "dataInfo_20_",
      spec: "32dataInfo_7_dataInfo_11_128BSSUNIT.pluralUnit.17",
      storage_gb: 400,
      periods: 2,
    },
  },
  {
    name: "yearly-ha-16u64g",
    input: {
      billing: "yearly",
      deploy_model: "dataInfo_25_",
      instance_type: "dataInfo_24_",
      db_version: "dataInfo_26_",
      database_type: "dataInfo_30_",
      public_type: "dataInfo_20_",
      spec: "16dataInfo_7_dataInfo_11_64BSSUNIT.pluralUnit.17",
      storage_gb: 400,
      periods: 1,
    },
  },
];
