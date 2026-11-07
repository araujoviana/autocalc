import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = ["1ge", "10ge", "40ge", "100ge"].flatMap(port => [
  { name: `monthly-${port}`, input: { billing: "monthly", port } },
  { name: `yearly-${port}`, input: { billing: "yearly", port } },
]);
