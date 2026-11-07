import { expect, test } from "bun:test";
import { buildEip } from "../../src/core/services/eip.ts";
test("EIP selects upflow rather than downflow", async () => {
  const context = { productInfo: async () => ({ product: { vpc_bandwidth: [{ resourceSpecCode: "12_bgp", cloudServiceType: "c", resourceType: "bandwidth", planList: [{ billingMode: "ONDEMAND", productId: "down", usageFactor: "downflow" }, { billingMode: "ONDEMAND", productId: "up", usageFactor: "upflow" }] }], vpc_ip: [{ resourceSpecCode: "5_bgp", cloudServiceType: "c", resourceType: "ip", planList: [{ billingMode: "ONDEMAND", productId: "ip" }] }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildEip({ service: "eip", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, eip_count: 1, traffic_gb: 10, ip_reservation: true }, context);
  const products = card.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(products.find(p => p.usageFactor === "upflow")).toMatchObject({ productId: "up", usageFactor: "upflow", usageValue: 10 });
});
