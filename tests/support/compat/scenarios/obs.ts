import type { Scenario } from "../replay.ts";
// Distinct value per line, so a swapped control shows up as a diff.
const lines = (vals: Record<string, number>) => Object.entries(vals).map(([factor, value]) => ({ factor, value, ...(factor.startsWith("size") ? { unit: "GB" } : {}) }));
export const scenarios: Scenario[] = [
  { name: "std", input: { billing: "ondemand", components: lines({ size: 100, "download.external": 10, "download.cdn": 20, download_crr: 30, get: 40, put: 50, delete: 60 }) } },
  { name: "std-3az", input: { billing: "ondemand", multi_az: true, components: lines({ size_3az: 100, "download.external": 10, get: 40, put: 50, delete: 60 }) } },
  { name: "warm", input: { billing: "ondemand", storage_class: "warm", components: lines({ size_warm: 100, "download_warm.external": 10, get_warm: 41, put_warm: 52, delete_warm: 63, retrieval_size_warm: 7, transition_warm: 85 }) } },
  { name: "warm-3az", input: { billing: "ondemand", storage_class: "warm", multi_az: true, components: lines({ size_warm_3az: 100, get_warm: 41, put_warm: 52, delete_warm: 63, retrieval_size_warm: 7, transition_warm: 85 }) } },
  { name: "cold", input: { billing: "ondemand", storage_class: "cold", components: lines({ size_cold: 100, "download_cold.external": 10, get_cold: 41, put_cold: 52, delete_cold: 63, restore_size_ex: 7, transition_cold: 85 }) } },
  { name: "pkg-monthly", input: { billing: "monthly", package: "10tb", periods: 3 } },
  { name: "pkg-yearly", input: { billing: "yearly", package: "10tb", periods: 1 } },
  { name: "pkg-3az-yearly", region: "ap-southeast-3", input: { billing: "yearly", package: "10tb", multi_az: true, periods: 1 } },
  { name: "pkg-3az-monthly", region: "ap-southeast-3", input: { billing: "monthly", package: "10tb", multi_az: true, periods: 1 } },
  { name: "pkg-traffic-1tb", region: "ap-southeast-3", input: { billing: "monthly", package: "10tb", traffic_package: "1tb", periods: 2 } },
  { name: "pkg-no-traffic", region: "ap-southeast-3", input: { billing: "yearly", package: "10tb", traffic_package: "none", periods: 1 } },
  { name: "pkg-3az-100gb", region: "ap-southeast-3", input: { billing: "monthly", package: "100gb", multi_az: true, periods: 1 } },
];
