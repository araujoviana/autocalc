import type { Scenario } from "../replay.ts";
const base = { flavor: "c7n.large.2", image: "AlmaLinux 9.4 64bit" };
export const scenarios: Scenario[] = [
  { name: "monthly", input: { ...base, billing: "monthly", periods: 3 } },
  { name: "yearly", input: { ...base, billing: "yearly", periods: 1 } },
  { name: "ondemand", input: { ...base, billing: "ondemand", hours: 500 } },
  { name: "ri-1y", input: { ...base, billing: "ri", ri_time: "1_3" } },
  { name: "ri-3y", input: { ...base, billing: "ri", ri_time: "3_3" } },
  { name: "quantity-5", input: { ...base, billing: "monthly", quantity: 5 } },
  { name: "image-ubuntu", input: { ...base, billing: "monthly", image: "Ubuntu 22.04 server 64bit" } },
  { name: "disks-mixed", input: { ...base, billing: "monthly", system_disk: ["SSD", 60], data_disks: [["GPSSD", 200], ["SAS", 500], ["ESSD", 100]] } },
  { name: "disks-ondemand", input: { ...base, billing: "ondemand", hours: 300, system_disk: ["GPSSD", 50], data_disks: [["SATA", 300]] } },
  { name: "bandwidth-bgp-monthly", input: { ...base, billing: "monthly", bandwidth_mbit: 10 } },
  { name: "bandwidth-bgp-yearly", input: { ...base, billing: "yearly", bandwidth_mbit: 25 } },
  { name: "bandwidth-traffic", input: { ...base, billing: "ondemand", hours: 400, bandwidth_type: "12_bgp", bandwidth_mbit: 5 } },
  { name: "bandwidth-ri", input: { ...base, billing: "ri", ri_time: "1_3", bandwidth_mbit: 8 } },
  { name: "flavor-large", input: { ...base, flavor: "c7n.8xlarge.4", billing: "yearly" } },
];
export const notes = ["BYOL flavors (`.byol`): the page builds the `.linux` spec for them, so a `.byol` card cannot match; not offered.", "The default image `AlmaLinux` matches every AlmaLinux release, so cards must name one (`AlmaLinux 9.4 64bit`); this is deliberate (plan flags it).", "Windows flavors (`.win`): none are sold in sa-brazil-1 (checked in the catalog); the `.win` suffix is accepted but unverified live."];
