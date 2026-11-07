import type { Scenario } from "../replay.ts";

export const scenarios: Scenario[] = [
  { name: "ondemand-mysql-ha", input: { billing: "ondemand", flavor: "rds.mysql.n1.large.2.ha", storage_gb: 100, hours: 400 } },
  { name: "monthly-mysql-single", input: { billing: "monthly", flavor: "rds.mysql.n1.large.2", storage_gb: 200, periods: 2, quantity: 2 } },
  { name: "yearly-pg-ha", input: { billing: "yearly", flavor: "rds.pg.n1.large.2.ha", storage_gb: 300, periods: 1 } },
];
