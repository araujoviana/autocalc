import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-cluster",
    input: {
      billing: "ondemand",
      type: "dataInfo_3_",
      flavor_type: "dataInfo_19_",
      shard_spec: "1BSSUNIT.unit.23dataInfo_13_4BSSUNIT.pluralUnit.17",
      shards: 2,
      shard_storage_gb: 100,
    },
  },
  {
    name: "monthly-cluster",
    input: {
      billing: "monthly",
      flavor_type: "dataInfo_21_",
      shard_spec: "4dataInfo_14_dataInfo_13_32BSSUNIT.pluralUnit.17",
      shards: 3,
      shard_storage_gb: 200,
      periods: 2,
      quantity: 2,
    },
  },
  {
    name: "yearly-cluster",
    input: {
      billing: "yearly",
      flavor_type: "dataInfo_21_",
      shard_spec: "4dataInfo_14_dataInfo_13_32BSSUNIT.pluralUnit.17",
      shards: 2,
      shard_storage_gb: 300,
      periods: 1,
    },
  },
];
