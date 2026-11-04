import { expect, test } from "bun:test";
import { PRIMARY_GROUP, specOption } from "../../src/core/services/publication.ts";

test("a catalog spec becomes the value its builder option expects", () => {
  expect(specOption("nat", "natgateway_small")).toBe("small");
  expect(specOption("evs", "GPSSD2.storage")).toBe("GPSSD2");
  expect(specOption("evs", "GPSSD")).toBe("GPSSD");
  expect(specOption("rds", "rds.mysql.n1.large.4")).toBe("rds.mysql.n1.large.4");
});

test("services that sell disks and add-ons beside the main product name their primary catalog group", () => {
  expect(PRIMARY_GROUP).toMatchObject({ ecs: "ec2_vm", evs: "ebs_volume", rds: "rds_rds.vm", sfs: "sfs_sfs", sdrs: "sdrs_hdrsinst", er: "er_er.attachment", des: "des_des", dss: "dss_dss.pool", memcached: "dcs_dcs.memcached", drs: "drs_drs.vm", ddm: "ddm_ddm", dds: "dds_dds.vm", gaussdb: "gaussdb_gaussdb.vm", rdsformariadb: "rdsformariadb_rdsformariadb.vm", taurusdb: "taurus_taurus.vm", hrds: "rds_rds.vm" });
});

test("sfs counts as mapped: its one SKU is the spec and the capacity control scales it", async () => {
  const { supportedServices } = await import("../../src/core/services/index.ts");
  expect(supportedServices().find(entry => entry.service === "sfs")).toMatchObject({ publication_supported: true, publication_blocked_reason: null });
});

test("sdrs, des, dss and er count as mapped, and their spec becomes the page option the SKU carries", async () => {
  const { supportedServices } = await import("../../src/core/services/index.ts");
  const { RECIPE_SPEC_FIELDS, USAGE_PRICED } = await import("../../src/core/services/publication.ts");
  for (const service of ["sdrs", "des", "dss", "er"]) expect(supportedServices().find(entry => entry.service === service)?.publication_supported).toBe(true);
  expect(RECIPE_SPEC_FIELDS.des!.fields).toEqual([["transfer_type", "transferTypeClass"]]);
  expect(RECIPE_SPEC_FIELDS.dss!.fields).toEqual([["type", "type"]]);
  expect(USAGE_PRICED.has("dss")).toBe(true);
});

test("every other mapped recipe is publishable, takes its page values from the SKU row, and SSA stays unmapped", async () => {
  const { supportedServices } = await import("../../src/core/services/index.ts");
  const { RECIPE_SPEC_FIELDS, USAGE_PRICED } = await import("../../src/core/services/publication.ts");
  for (const service of ["memcached", "drs", "ddm", "dds", "gaussdb", "rdsformariadb", "taurusdb", "hrds"]) expect(supportedServices().find(entry => entry.service === service)?.publication_supported).toBe(true);
  expect(RECIPE_SPEC_FIELDS.drs!.fields).toEqual([["type", "drsType"], ["flow", "flowInout"], ["specification", "specificationType"]]);
  expect(USAGE_PRICED.has("memcached")).toBe(true);
  expect(RECIPE_SPEC_FIELDS.ssa).toBeUndefined();
  expect(supportedServices().find(entry => entry.service === "ssa")?.publication_supported).toBe(false);
});
