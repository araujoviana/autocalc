import { expect, test } from "bun:test";
import { buildEcs } from "../../src/core/services/ecs.ts";
test("ECS without bandwidth preserves no-public-IP form state and addible disks", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = { productInfo: async () => ({ product: { ec2_vm: [{ resourceSpecCode: "c7.linux", cloudServiceType: "c", resourceType: "vm", spec: "c7", arch: "x", vmType: "v", cpu: "2", mem: "4", generation: "g", planList }], "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }], ebs_volume: [{ resourceSpecCode: "GPSSD", cloudServiceType: "c", resourceType: "disk", type: "ssd", planList }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildEcs({ service: "ecs", region: "r", billing: "monthly", quantity: 1, periods: 1, hours: 730, flavor: "c7", image: "AlmaLinux", system_disk: ["GPSSD", 40], data_disks: [["GPSSD", 100]], bandwidth_type: "19_bgp", ri_time: "1_3" }, context);
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_eip_switch: { UNSET_Switch: "calc_15_" }, calculator_evs_stepper: { "calculator_evs_stepper_|addible0|_0": { UNSET_Stepper_0: { measureValue: 100 } } } } });
  const zero = await buildEcs({ service: "ecs", region: "r", billing: "monthly", quantity: 1, periods: 1, hours: 730, flavor: "c7", image: "AlmaLinux", system_disk: ["GPSSD", 40], bandwidth_mbit: 0, bandwidth_type: "19_bgp", ri_time: "1_3" }, context);
  expect(zero.rewriteValue).toMatchObject({ template_RENDER: { calculator_eip_switch: { UNSET_Switch: "calc_15_" } } });
  expect(zero.selectedProduct.productAllInfos).not.toEqual(expect.arrayContaining([expect.objectContaining({ resourceType: "hws.resource.type.bandwidth" })]));
});

test("ECS RI includes selected-level installment aggregates", async () => {
  const context = { productInfo: async () => ({ product: { ec2_vm: [{ resourceSpecCode: "c7.linux", RITime: "nodeData.1_3", cloudServiceType: "c", resourceType: "vm", spec: "c7", arch: "x", vmType: "v", cpu: "2", mem: "4", generation: "g", planList: [{ billingMode: "RI", originType: "price", productId: "p", amount: 0 }, { billingMode: "RI", originType: "perPrice", amount: 10 }] }], "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }], ebs_volume: [{ resourceSpecCode: "GPSSD", cloudServiceType: "c", resourceType: "disk", type: "ssd", planList: [{ billingMode: "ONDEMAND", productId: "d", amount: 0.001 }] }] } }), rate: async () => { throw new Error("RI should use catalog pricing"); } };
  const card = await buildEcs({ service: "ecs", region: "r", billing: "ri", quantity: 1, periods: 1, hours: 730, flavor: "c7", image: "AlmaLinux", system_disk: ["GPSSD", 40], bandwidth_type: "19_bgp", ri_time: "1_3" }, context);
  expect(card.selectedProduct).toMatchObject({ chargeModeName: "RI", perAmount: 39.2, amount: 470.4, installAmount: 0 });
});

test("ECS RI retains a catalog disk quantity as Python did", async () => {
  const context = { productInfo: async () => ({ product: { ec2_vm: [{ resourceSpecCode: "c7.linux", RITime: "nodeData.1_3", spec: "c7", planList: [{ billingMode: "RI", originType: "perPrice", amount: 10 }] }], "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }], ebs_volume: [{ resourceSpecCode: "GPSSD", type: "ssd", productNum: 1, planList: [{ billingMode: "ONDEMAND", productId: "d", amount: 0.001 }] }] } }), rate: async () => { throw new Error("RI should use catalog pricing"); } };
  const card = await buildEcs({ service: "ecs", region: "r", billing: "ri", quantity: 2, periods: 1, hours: 730, flavor: "c7", image: "AlmaLinux", system_disk: ["GPSSD", 40], bandwidth_type: "19_bgp", ri_time: "1_3" }, context);
  const products = card.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(products[2]).toMatchObject({ productNum: 1, inquiryResult: { perAmount: 29.2 } });
  expect(card.selectedProduct).toMatchObject({ perAmount: 49.2 });
});

test("ECS RI uses the last catalog plan for each origin type", async () => {
  const context = { productInfo: async () => ({ product: { ec2_vm: [{ resourceSpecCode: "c7.linux", RITime: "nodeData.1_3", spec: "c7", planList: [{ billingMode: "RI", originType: "perPrice", amount: 10 }, { billingMode: "RI", originType: "perPrice", amount: 20 }] }], "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }], ebs_volume: [{ resourceSpecCode: "GPSSD", type: "ssd", planList: [{ billingMode: "ONDEMAND", productId: "d", amount: 0 }] }] } }), rate: async () => { throw new Error("RI should use catalog pricing"); } };
  const card = await buildEcs({ service: "ecs", region: "r", billing: "ri", quantity: 1, periods: 1, hours: 730, flavor: "c7", image: "AlmaLinux", system_disk: ["GPSSD", 40], bandwidth_type: "19_bgp", ri_time: "1_3" }, context);
  expect(card.selectedProduct).toMatchObject({ perAmount: 20, amount: 240 });
});
