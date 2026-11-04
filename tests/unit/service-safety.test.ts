import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";
import { buildCce } from "../../src/core/services/cce.ts";
import { buildEcs } from "../../src/core/services/ecs.ts";
import { buildLtsForm, buildRecipe, RECIPES } from "../../src/core/services/forms.ts";
import { supportedServices } from "../../src/core/services/index.ts";
import { VERIFIED } from "../../src/core/services/publication.ts";

test.each(
  Object.entries(RECIPES).filter(([, r]) => !r.quantity).map(([s]) => s),
)("recipe %s rejects unrepresented quantity", service => {
  const mode = RECIPES[service]!.modes[0]!;
  expect(() => buildRecipe(service, { region: "test", billing: mode, quantity: 3 })).toThrow();
});

test("redis rejects zero-priced ondemand mode", () => {
  expect(() => buildRecipe("redis", { region: "test", billing: "ondemand" })).toThrow();
});

test.each([
  { storage_class: "typo" },
  { billing: "monthly" },
  { storage_class: "cold", multi_az: true },
  { components: [{ factor: "size", value: 10 }] },
  { components: [{ factor: "typo", value: 10 }] },
  { components: [{ factor: "get_warm", value: 3 }] },
  { components: [{ factor: "size_3az", value: 3, unit: "GB" }] },
  { components: [{ factor: "get", value: Number.NaN }] },
  { components: [{ factor: "get", value: -1 }] },
  { components: [{ factor: "get", value: 1 }, { factor: "get", value: 2 }] },
  { components: [{ factor: "get", value: 1 }], quantity: 3 },
  { package: "small", components: [{ factor: "get", value: 1 }] },
])("obs invalid request fails before catalog access (%o)", options => {
  expect(CardInput.safeParse({ service: "obs", region: "test", ...options }).success).toBe(false);
});

test("unverified compute and storage defaults cannot publish", () => {
  for (const service of ["function", "lts", "hecs"]) {
    expect(VERIFIED.has(service)).toBe(false);
  }
});

test.each(["turbo", "typo"])("cce rejects unverified cluster_type %s before catalog", async cluster_type => {
  const context = { productInfo: async () => { throw new Error("catalog should not be accessed"); }, rate: async () => ({}) };
  await expect(buildCce({ service: "cce", region: "test", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type, ha: true, scale: "small" }, context)).rejects.toThrow();
});

test("ecs rejects ambiguous image before selecting catalog order", async () => {
  const context = {
    productInfo: async () => ({
      product: {
        ec2_vm: [{ resourceSpecCode: "small.linux", arch: "x86", vmType: "general", spec: "small", cpu: "2", mem: "4", planList: [{ billingMode: "MONTHLY", productId: "p", amount: 1 }] }],
        "ec2_vm.image.special": [
          { id: "a", __platform: "Linux", name: "AlmaLinux 9.4", type: ["small"] },
          { id: "b", __platform: "Linux", name: "AlmaLinux 9.5", type: ["small"] },
        ],
      },
    }),
    rate: async () => ({ productRatingResult: [] }),
  };
  await expect(buildEcs({ service: "ecs", region: "test", billing: "monthly", quantity: 1, periods: 1, hours: 730, flavor: "small", image: "AlmaLinux", system_disk: ["GPSSD", 40], bandwidth_type: "19_bgp", ri_time: "1_3" }, context)).rejects.toThrow(/multiple catalog images/);
});

test("lts page form preserves zero daily inputs and cold retention", () => {
  const form = buildLtsForm({ region: "test", flow_gb_per_day: 0, cold_enabled: true, retention_days: 90, hot_retention_days: 7, months: 2 });
  const render = form.template_RENDER;
  expect(render.calculator_ltsLogFlow_stepper.UNSET_Stepper_0.measureValue).toBe(0);
  expect(render.calculator_ltsStorage_stepper.UNSET_Stepper_0.measureValue).toBe(90);
  expect(render.calculator_ltsHotStorage_stepper.UNSET_Stepper_0.measureValue).toBe(7);
  expect(form.global_ONDEMANDTIME.UNSET_Stepper_0.measureValue).toBe(2);
  expect(VERIFIED.has("lts")).toBe(false);
});

test.each([
  { storage_mb: 720 },
  { cold_mb: 720 },
  { flow_gb_per_day: Number.POSITIVE_INFINITY },
  { index_percent: 101 },
  { cold_enabled: true, hot_retention_days: 31, retention_days: 30 },
])("lts rejects ambiguous or invalid inputs (%o)", options => {
  expect(() => buildLtsForm({ region: "test", ...options })).toThrow();
});

test("capability discovery distinguishes publication support", () => {
  const rows = Object.fromEntries(supportedServices().map(row => [row.service, row]));
  expect(rows.ecs!.publication_supported).toBe(true);
  for (const service of ["lts", "function"]) {
    expect(rows[service]!.publication_supported).toBe(false);
    expect(rows[service]!.publication_blocked_reason).toBeTruthy();
  }
  expect(rows.eip!.publication_supported).toBe(true);
  expect(rows.eip!.verified_frontend).not.toBeNull();
});
