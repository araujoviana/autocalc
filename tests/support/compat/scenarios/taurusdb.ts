import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-2u8g",
    input: {
      billing: "ondemand",
      enterprise_instance: "dataInfo_39_",
      public_type: "dataInfo_20_",
      spec: "2dataInfo_7_dataInfo_11_8BSSUNIT.pluralUnit.17",
      nodes: 2,
    },
  },
  {
    name: "monthly-8u32g",
    input: {
      billing: "monthly",
      enterprise_instance: "dataInfo_39_",
      public_type: "dataInfo_20_",
      spec: "8dataInfo_7_dataInfo_11_32BSSUNIT.pluralUnit.17",
      nodes: 3,
      storage_gb: 400,
      periods: 2,
      quantity: 2,
    },
  },
  {
    name: "yearly-4u16g",
    input: {
      billing: "yearly",
      enterprise_instance: "dataInfo_39_",
      public_type: "dataInfo_20_",
      spec: "4dataInfo_7_dataInfo_11_16BSSUNIT.pluralUnit.17",
      nodes: 2,
      storage_gb: 300,
      periods: 1,
    },
  },
];
