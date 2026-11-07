import type { Scenario } from "../replay.ts";
export const scenarios: Scenario[] = [
  { name: "reserved", input: { billing: "ondemand", eip_count: 1, traffic_gb: 0, ip_reservation: true, hours: 500 } },
  { name: "traffic-700", input: { billing: "ondemand", traffic_gb: 700, hours: 600 } },
  { name: "reserved-traffic", input: { billing: "ondemand", eip_count: 3, traffic_gb: 120, ip_reservation: true, hours: 300 } },
];
export const notes = ["Traffic-only cards (`ip_reservation: false`): the page always adds the public IP line, so they are rejected.", "Not built: bandwidth-billed EIPs, shared bandwidth and the other product types (`dataInfo_4_`, `_13_`, `_36_`), and the yearly/monthly (PERIOD) EIP."];
