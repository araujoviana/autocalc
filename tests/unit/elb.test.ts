import { expect, test } from "bun:test";
import { buildElb } from "../../src/core/services/elb.ts";
test("ELB on-demand has two products and an IP stepper without transfer fields", async () => {
  const context = { productInfo: async () => ({ product: { elb_elbv2: ["elbv2.basic.default", "21_instance"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "r", elbType: "shared", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode, amount: 1 }] })) } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildElb({ service: "elb", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, public_ip_count: 2 }, context);
  expect(card.selectedProduct.amount).toBe(2);
  const ip = ((card.rewriteValue.template_RENDER as Record<string, unknown>).calculator_ip as { UNSET_Stepper_0: Record<string, unknown> }).UNSET_Stepper_0;
  expect(ip).toMatchObject({ measureId: 14, measureValue: 2 });
  expect(ip).not.toHaveProperty("transRate");
});

test("ELB preserves null usage factors from the selected catalog plans", async () => {
  let factors: unknown[] = [];
  const context = { productInfo: async () => ({ product: { elb_elbv2: ["elbv2.basic.default", "21_instance"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode, amount: 1, usageFactor: null }] })) } }), rate: async (body: Record<string, unknown>) => { const lines = body.productInfos as Array<{ id: string; usageFactor: unknown }>; factors = lines.map(line => line.usageFactor); return { productRatingResult: lines.map(({ id }) => ({ id, amount: 1 })) }; } };
  await buildElb({ service: "elb", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, public_ip_count: 2 }, context);
  expect(factors).toEqual([null, null]);
});

test("Dedicated ELB selects exact flavor, azType, protocol, and encodes L4/L7 LCUs", async () => {
  const { createSyntheticBusinessCatalog } = await import("../support/business-catalog.ts");
  const { catalog } = createSyntheticBusinessCatalog();
  const context = {
    productInfo: (service: string, region: string) => catalog.productInfo(service, region),
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  // 1. Single AZ (calc_64_), TCP (calc_69_), L4 LCU
  const elbSingleTcp = await buildElb(
    {
      service: "elb",
      region: "sa-brazil-1",
      billing: "ondemand",
      type: "dedicated",
      flavor: "elbv3.professional",
      az_type: "single",
      protocol: "tcp",
      l4_lcu: 5,
      quantity: 1,
      periods: 1,
      hours: 730,
    },
    context
  );
  const prods1 = elbSingleTcp.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(prods1.length).toBe(2);
  expect(prods1[0]!.resourceSpecCode).toBe("elbv3.professional");
  expect(prods1[0]!.azType).toBe("calc_64_");
  expect(prods1[0]!.flavorType).toBe("calc_69_");
  expect(prods1[1]!.resourceSpecCode).toBe("elbv3.professional");
  expect(prods1[1]!.azType).toBe("calc_64_");
  expect(prods1[1]!.flavorType).toBe("calc_69_");
  expect(prods1[1]!.resourceSize).toBe(5);

  const render1 = elbSingleTcp.rewriteValue.template_RENDER as Record<string, any>;
  expect(render1.calculator_elb_type.elbType).toBe("dataInfo_3_");
  expect(render1.calculator_elb_type_spec.azType).toBe("calc_64_");
  expect(render1.calculator_flavor_checkboxGroup.flavorType).toEqual(["calc_69_"]);
  expect(render1.calculator_lcu_network.UNSET_Stepper_0.measureValue).toBe(5);

  // 2. Multi AZ (calc_67_), TLS (calc_71_), L4 and L7 LCUs
  const elbMultiTls = await buildElb(
    {
      service: "elb",
      region: "la-south-2",
      billing: "ondemand",
      type: "dedicated",
      flavor: "elbv3.professional",
      az_type: "multi",
      protocol: "tls",
      l4_lcu: 10,
      l7_lcu: 20,
      quantity: 1,
      periods: 1,
      hours: 730,
    },
    context
  );
  const prods2 = elbMultiTls.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(prods2.length).toBe(3);
  expect(prods2[0]!.azType).toBe("calc_67_");
  expect(prods2[0]!.flavorType).toBe("calc_71_");
  expect(prods2[1]!.azType).toBe("calc_67_");
  expect(prods2[1]!.flavorType).toBe("calc_71_");
  expect(prods2[1]!.resourceSize).toBe(10);
  expect(prods2[2]!.azType).toBe("calc_67_");
  expect(prods2[2]!.flavorType).toBe("calc_39_");
  expect(prods2[2]!.resourceSize).toBe(20);

  const render2 = elbMultiTls.rewriteValue.template_RENDER as Record<string, any>;
  expect(render2.calculator_elb_type_spec.azType).toBe("calc_67_");
  expect(render2.calculator_flavor_checkboxGroup.flavorType).toEqual(["calc_71_", "calc_39_"]);
  expect(render2.calculator_lcu_network.UNSET_Stepper_0.measureValue).toBe(10);
  expect(render2.calculator_lcu_application.UNSET_Stepper_0.measureValue).toBe(20);

  // 3. Rejects non-ondemand billing for dedicated ELB
  await expect(
    buildElb(
      {
        service: "elb",
        region: "sa-brazil-1",
        billing: "monthly" as any,
        type: "dedicated",
        quantity: 1,
        periods: 1,
        hours: 730,
      },
      context
    )
  ).rejects.toThrow(/Dedicated ELB only supports on-demand billing/);
});
