import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "gpssd-ondemand", input: { billing: "ondemand", type: "GPSSD", size_gb: 150, hours: 500 } },
  { name: "gpssd-monthly", input: { billing: "monthly", type: "GPSSD", size_gb: 200, periods: 3 } },
  { name: "gpssd-yearly", input: { billing: "yearly", type: "GPSSD", size_gb: 250 } },
  { name: "ssd", input: { billing: "monthly", type: "SSD", size_gb: 300 } },
  { name: "sas", input: { billing: "monthly", type: "SAS", size_gb: 350 } },
  { name: "sata", input: { billing: "yearly", type: "SATA", size_gb: 400 } },
  { name: "essd", input: { billing: "monthly", type: "ESSD", size_gb: 450 } },
  { name: "gpssd2-ondemand", input: { billing: "ondemand", type: "GPSSD2", size_gb: 500, iops: 4000, throughput: 200, hours: 400 } },
  { name: "quantity-3", input: { billing: "monthly", type: "GPSSD", size_gb: 100, quantity: 3 } },
];
export const notes = ["ESSD2: the page in sa-brazil-1 does not list it (`calc_10_` is not offered), so it cannot be replayed there."];
