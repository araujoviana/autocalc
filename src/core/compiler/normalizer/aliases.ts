/** Canonical service alias mapping for `version: "1"` quote compilation. */
export const SERVICE_ALIASES: Record<string, string> = {
  dcs: "redis",
  dmq: "kafka",
  "dms-kafka": "kafka",
  "dms-rabbitmq": "rabbitmq",
  fg: "function",
  functiongraph: "function",
  "sfs-turbo": "sfsturbo",
  sfs_turbo: "sfsturbo",
  dc: "dline",
  "direct-connect": "dline",
  direct_connect: "dline",
  geminidb: "nosql",
  kms: "dew",
  csms: "dew",
  mariadb: "rdsformariadb",
  mongodb: "dds",
  secmaster: "ssa",
  flexus: "hecs",
  "flexus-x": "hecs",
  flexus_x: "hecs",
};

/** Resolve a declared service alias into its canonical autocalc service id. */
export function normalizeServiceAlias(service: string): string {
  const clean = service.trim().toLowerCase();
  return SERVICE_ALIASES[clean] ?? clean;
}
