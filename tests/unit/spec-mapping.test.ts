import { expect, test } from "bun:test";
import { PRIMARY_GROUP, specOption } from "../../src/core/services/publication.ts";

test("a catalog spec becomes the value its builder option expects", () => {
  expect(specOption("nat", "natgateway_small")).toBe("small");
  expect(specOption("evs", "GPSSD2.storage")).toBe("GPSSD2");
  expect(specOption("evs", "GPSSD")).toBe("GPSSD");
  expect(specOption("rds", "rds.mysql.n1.large.4")).toBe("rds.mysql.n1.large.4");
});

test("services that sell disks and add-ons beside the main product name their primary catalog group", () => {
  expect(PRIMARY_GROUP).toMatchObject({ ecs: "ec2_vm", evs: "ebs_volume", rds: "rds_rds.vm" });
});
