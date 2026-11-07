import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "monthly-mysql-y1-ha",
    input: {
      billing: "monthly",
      db_type: "dataInfo_52_",
      db_version: "dataInfo_57_",
      instance_type: "dataInfo_14_",
      spec: "4dataInfo_40_dataInfo_24_8BSSUNIT.pluralUnit.17dataInfo_66_",
      storage_gb: 240,
      periods: 2,
      quantity: 2,
    },
  },
  {
    name: "yearly-mysql-y1-ha",
    input: {
      billing: "yearly",
      db_type: "dataInfo_52_",
      db_version: "dataInfo_57_",
      instance_type: "dataInfo_14_",
      spec: "4dataInfo_40_dataInfo_24_8BSSUNIT.pluralUnit.17dataInfo_66_",
      storage_gb: 240,
      periods: 1,
    },
  },
];
