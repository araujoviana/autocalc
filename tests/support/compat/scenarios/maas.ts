import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  {
    name: "ondemand-deepseek-flash",
    region: "ap-southeast-1",
    input: {
      billing: "ondemand",
      model_series: "dataInfo_13_",
      model_name: "dataInfo_86_",
      input_mtokens: 10,
      output_mtokens: 5,
    },
  },
];
