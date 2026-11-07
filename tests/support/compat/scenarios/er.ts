import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "traffic-attachments", input: { billing: "ondemand", downflow_gb: 500, attachment_hours: 300, attachments: 4 } },
  { name: "no-attachments", input: { billing: "ondemand", downflow_gb: 100, attachment_hours: 730, attachments: 0 } },
];
