import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-2m-256mb",
    input: {
      billing: "ondemand",
      requests: 2000000,
      gb_seconds: 100000,
      memory_mb: 256,
      compute_units: 200,
      request_units: 200,
    },
  },
  {
    name: "ondemand-5m-512mb",
    input: {
      billing: "ondemand",
      requests: 5000000,
      gb_seconds: 1250000,
      memory_mb: 512,
      compute_units: 500,
      request_units: 500,
    },
  },
];
