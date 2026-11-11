import { expect, test } from "bun:test";
import { CalculatorError } from "../../src/core/errors.ts";
import { requirement } from "../../src/core/quote/model.ts";
import { formatDecimal } from "../../src/core/quote/decimal.ts";
import { HuaweiProvider, parseCompute, type CatalogSku, type HuaweiSource } from "../../src/providers/huawei.ts";

const D = "vCPUs: 4 | Memory: 16384 MB";
const sku = (spec: string, prices: CatalogSku["prices"], extra: Partial<CatalogSku> = {}, group = "ec2_vm", description = D): CatalogSku => ({ group, spec, description, prices, ...extra });

function source(skus: CatalogSku[], counter = { calls: 0 }): HuaweiSource {
  return {
    skus: async () => { counter.calls++; return skus; },
    checkMode: async (_service, region) => {
      if (region === "nowhere") throw new CalculatorError("SERVICE_NOT_SOLD", "no", undefined, { available_regions: ["sa-brazil-1"] });
    },
  };
}
const standard = [sku("c7n.xlarge.4", { monthly: { amount: 0.1234567 } }), sku("s6.xlarge.4", { ondemand: { amount: 1 } }), sku("SSD", { monthly: { amount: 3 } }, {}, "evs", "disk")];
const req = (o: Partial<Parameters<typeof requirement>[0]> = {}) => requirement({ id: "r", service: "ecs", region: "sa-brazil-1", billing: "monthly", ...o });

test("candidates are priced SKUs for the mode, with sizes and generation", async () => {
  const c = await new HuaweiProvider(source(standard)).candidates(req());
  expect(c.map(x => x.spec)).toEqual(["c7n.xlarge.4", "SSD"]);
  expect(formatDecimal(c[0]!.price)).toBe("0.1234567");
  expect(c[0]!.has).toEqual({ vcpus: 4, memory_gb: 16 });
  expect(c[0]!.generation).toBe(7);
  expect(c[1]!.has).toEqual({});
  expect(c[1]!.generation).toBe(0);
  expect((await new HuaweiProvider(source(standard)).candidates(req({ group: "ec2_vm" }))).map(x => x.spec)).toEqual(["c7n.xlarge.4"]);
});

test("an unavailable region throws instead of returning empty", async () => {
  const error = await new HuaweiProvider(source(standard)).candidates(req({ region: "nowhere" })).catch(e => e);
  expect(error).toBeInstanceOf(CalculatorError);
  expect(error.details.available_regions).toEqual(["sa-brazil-1"]);
});

test("ri is rejected before any catalog call", async () => {
  const counter = { calls: 0 };
  const error = await new HuaweiProvider(source(standard, counter)).candidates(req({ billing: "ri" })).catch(e => e);
  expect(error.details).toEqual({ field: "billing", allowed: ["ondemand", "monthly", "yearly"] });
  expect(counter.calls).toBe(0);
});

test("ECS flavors are offered for the OS of the requested image", async () => {
  const flavors = ["byol", "linux", "win"].map(os => sku(`c7n.xlarge.4.${os}`, { monthly: { amount: 1 } }));
  const p = new HuaweiProvider(source(flavors));
  expect((await p.candidates(req())).map(x => x.spec)).toEqual(["c7n.xlarge.4.linux"]);
  expect((await p.candidates(req({ options: { image: "Windows Server 2022" } }))).map(x => x.spec)).toEqual(["c7n.xlarge.4.win"]);
});

test("a spec that names its own OS is offered whatever the image", async () => {
  const flavors = ["byol", "linux", "win"].map(os => sku(`c7n.xlarge.4.${os}`, { monthly: { amount: 1 } }));
  const p = new HuaweiProvider(source(flavors));
  expect((await p.candidates(req({ spec: "c7n.xlarge.4.byol" }))).map(x => x.spec)).toContain("c7n.xlarge.4.byol");
  expect((await p.candidates(req({ spec: "c7n.xlarge.4.win" }))).map(x => x.spec)).toContain("c7n.xlarge.4.win");
});

test("flavors the page does not list are not offered", async () => {
  const p = new HuaweiProvider(source([sku("t7.xlarge.2.linux", { monthly: { amount: 1 } }, { offPage: true }), sku("t6.xlarge.2.linux", { monthly: { amount: 2 } })]));
  expect((await p.candidates(req())).map(x => x.spec)).toEqual(["t6.xlarge.2.linux"]);
});

test("the OS filter applies only to ECS", async () => {
  const p = new HuaweiProvider(source([sku("flavor.win", { monthly: { amount: 1 } })]));
  expect((await p.candidates(req({ service: "rds" }))).map(x => x.spec)).toEqual(["flavor.win"]);
});

test("parseCompute reads vCPUs and memory in GB, or nothing", () => {
  expect(parseCompute(D)).toEqual({ vcpus: 4, memory_gb: 16 });
  expect(parseCompute("disk")).toEqual({});
  expect(parseCompute("Memory: 512 MB")).toEqual({ memory_gb: 0.5 });
});

test("a VPN gateway SKU outside the primary group is offered without a list price", async () => {
  const p = new HuaweiProvider(source([sku("19_bgp", { monthly: { amount: 5 } }), { ...sku("V300", {}), group: "vpn_vpn.ipsecvpn" }]));
  const found = await p.candidates(req({ service: "vpn", spec: "V300", group: "vpc_bandwidth" }));
  expect(found.map(x => x.spec)).toContain("V300");
});
