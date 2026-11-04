import { expect, test } from "bun:test";
import { inquiry, quote, exchangeRates, convertCurrency } from "../../src/core/pricing.ts";

test("retries transient rating errors but not business errors", async () => {
  let attempts = 0;
  const retrying = async () => { attempts++; return attempts < 3 ? { status: 503, body: {} } : { status: 200, body: { exceptionId: "CBC.0000", result: 0 } }; };
  expect(await inquiry(retrying, {}, { wait: async () => {} })).toMatchObject({ result: 0 });
  expect(attempts).toBe(3);
  attempts = 0;
  await expect(inquiry(async () => { attempts++; return { status: 200, body: { exceptionId: "CBC.6001" } }; }, {}, { wait: async () => {} })).rejects.toThrow();
  expect(attempts).toBe(1);
  await expect(inquiry(async () => ({ status: 400, body: { error_code: "CBC.6006" } }), {}, { wait: async () => {} })).rejects.toMatchObject({ code: "SPEC_NOT_FOUND" });
});

test("exchange rates paginate USD rows and convert without discarding zero", async () => {
  const pages: number[] = [];
  const rates = await exchangeRates(async page => { pages.push(page); return page === 1 ? { totalSize: 3, data: [{ baseCurrency: "USD", currency: "BRL", rate: 5 }, { baseCurrency: "EUR", currency: "GBP", rate: 2 }] } : { totalSize: 3, data: [] }; });
  expect(pages).toEqual([1, 2]);
  expect(convertCurrency(0, "brl", rates)).toEqual({ usd: 0, currency: "BRL", rate: 5, amount: 0 });
  expect(convertCurrency(1, "xyz", rates)).toMatchObject({ error: "no rate for xyz", available: ["BRL"] });
});

test("quote scales duration but not traffic and keeps zero original amount", async () => {
  const result = await quote({ region: "r", billing: "ondemand", hours: 10, periods: 1, items: [{ service: "ecs", spec: "a", quantity: 1 }, { service: "obs", spec: "b", quantity: 1, usage_factor: "traffic", usage_value: 5, usage_measure_id: 17 }] }, async item => ({ cloudServiceType: "c", resourceType: "r", description: item.spec, usageFactor: "Duration" }), async body => {
    expect(body).toMatchObject({ regionId: "r", chargingMode: 1, periodType: 4, productInfos: [{ usageFactor: "Duration", usageValue: 1 }, { usageFactor: "traffic", usageValue: 5 }] });
    return { productRatingResult: [{ id: "item0", amount: 2, originalAmount: 0 }, { id: "item1", amount: 3, originalAmount: 3 }] };
  });
  expect(result).toMatchObject({ total: 23, list_price: 3 });
});

test("cancellation interrupts an in-flight rating and does not retry", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const result = inquiry(async () => { attempts++; return await new Promise<{ status: number; body: unknown }>(() => {}); }, {}, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ code: "CANCELLED" });
  expect(attempts).toBe(1);
});

test("OBS storage quote uses the matching capacity measure and calculator storage multiplier", async () => {
  const { QuoteInput } = await import("../../src/core/schemas.ts");
  const input = QuoteInput.parse({ region: "r", items: [{ service: "obs", spec: "obs.001", usage_factor: "size", usage_value: 100 }] });
  let sent: Record<string, unknown> = {};
  const result = await quote(input, async () => ({ cloudServiceType: "c", resourceType: "r", description: "" }), async body => { sent = body; return { productRatingResult: [{ id: "item0", amount: 1 }] }; });
  expect(sent.productInfos).toMatchObject([{ usageMeasureId: 10, usageValue: 100 }]);
  expect(result.total).toBe(720);
});

test("OBS request and egress quote use their own billing measures", async () => {
  const { QuoteInput } = await import("../../src/core/schemas.ts");
  const input = QuoteInput.parse({ region: "r", items: [
    { service: "obs", spec: "obs.001", usage_factor: "get", usage_value: 100 },
    { service: "obs", spec: "obs.001", usage_factor: "download.external", usage_value: 100 },
  ] });
  let sent: Record<string, unknown> = {};
  await quote(input, async () => ({ cloudServiceType: "c", resourceType: "r", description: "" }), async body => { sent = body; return { productRatingResult: [{ id: "item0", amount: 1 }, { id: "item1", amount: 1 }] }; });
  expect(sent.productInfos).toMatchObject([{ usageMeasureId: 54 }, { usageMeasureId: 10 }]);
});
