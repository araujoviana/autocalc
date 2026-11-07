import type { Scenario } from "../replay.ts";
const v = (spec: string) => `vault.backup.${spec}`;
export const scenarios: Scenario[] = [
  { name: "yearly-server", input: { billing: "yearly" } },
  { name: "monthly-server", input: { billing: "monthly", size_gb: 300, periods: 2 } },
  { name: "ondemand-server", input: { billing: "ondemand", size_gb: 250, hours: 400 } },
  { name: "database", input: { billing: "monthly", vault_spec: v("database.normal"), size_gb: 150 } },
  { name: "volume", input: { billing: "monthly", vault_spec: v("volume.normal"), size_gb: 175 } },
  { name: "server-multiaz", input: { billing: "monthly", vault_spec: v("server.multiaz"), size_gb: 190 } },
  { name: "turbo", input: { billing: "monthly", vault_spec: v("turbo.normal"), size_gb: 210 } },
  { name: "database-multiaz", input: { billing: "monthly", vault_spec: v("database.multiaz"), size_gb: 220 } },
  { name: "workspace", input: { billing: "monthly", vault_spec: v("workspace.normal"), size_gb: 230 } },
  { name: "replication", input: { billing: "monthly", vault_spec: "vault.replication.server.normal", size_gb: 250 } },
];
export const notes = ["Hybrid cloud vaults (`vault.hybrid.*`): the page does not keep the typed capacity (capacity control `calculator_cbr_type_Stepper_0`), so they cannot be encoded.", "Dedicated-cloud (`*.dec.*`) vaults: not built."];
