import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  ...["small", "middle", "large", "xlarge"].map(size => ({ name: `ondemand-${size}`, input: { billing: "ondemand", size, hours: 400 } })),
  { name: "monthly-small", input: { billing: "monthly", size: "small", periods: 2 } },
  { name: "yearly-large", input: { billing: "yearly", size: "large" } },
];
