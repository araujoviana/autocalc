import { expect, test } from "bun:test";
import { readPriceList, shareDetail, ListSession } from "../../src/core/lists.ts";
import { CalculatorError } from "../../src/core/errors.ts";

test("list operations preserve missing-session errors and report uncertain writes", async () => {
  const missing = new ListSession(async () => { throw new CalculatorError("AUTH_REQUIRED", "No session"); }, async () => {});
  await expect(missing.lists()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await expect(missing.create({})).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  const uncertain = new ListSession(async () => { throw new Error("timeout"); }, async () => {});
  await expect(uncertain.update("abc", {})).rejects.toMatchObject({ code: "MUTATION_UNKNOWN" });
  await expect(uncertain.delete("abc")).rejects.toMatchObject({ code: "MUTATION_UNKNOWN" });
  await expect(uncertain.copy("abc")).rejects.toMatchObject({ code: "MUTATION_UNKNOWN" });
});

test("reads and normalizes share details without losing zero amounts", async () => {
  const reader = { async getUncached() { return { retCode: "200", data: { name: "Test", totalPrice: { amount: 0 }, cartListData: [{ selectedProduct: { serviceCode: "ecs", region: "r", amount: 0, productAllInfos: [{ resourceSpecCode: "x", productNum: 1, inquiryResult: { amount: 0 } }] } }] } }; } };
  const result = await readPriceList(reader, "abc123");
  expect(result).toMatchObject({ id: "abc123", total: 0, items: [{ service: "ecs", amount: 0, products: [{ spec: "x", amount: 0 }] }] });
});

test("shared-list business errors do not require a success data payload", async () => {
  await expect(shareDetail({ getUncached: async () => ({ retCode: "CBC.6006" }) }, "abc")).rejects.toMatchObject({ code: "SPEC_NOT_FOUND", details: { exceptionId: "CBC.6006" } });
});

test("mutations retry only after explicit authentication denial", async () => {
  let calls = 0, refreshes = 0;
  const session = new ListSession(async () => { calls++; return calls === 1 ? { status: 200, body: { retCode: "CBC.0101" } } : { status: 200, body: { retCode: 200, data: "abc123" } }; }, async () => { refreshes++; });
  expect(await session.create({ name: "x", cartListData: [] })).toBe("abc123");
  expect([calls, refreshes]).toEqual([2, 1]);
  const ambiguous = new ListSession(async () => { throw new Error("timeout"); }, async () => { throw new Error("must not refresh"); });
  await expect(ambiguous.create({ name: "x", cartListData: [] })).rejects.toMatchObject({ code: "MUTATION_UNKNOWN" });
  const invalid = new ListSession(async () => ({ status: 200, body: { retCode: 200 } }), async () => {});
  await expect(invalid.create({ name: "x", cartListData: [] })).rejects.toMatchObject({ code: "MUTATION_UNKNOWN" });
  await expect(invalid.copy("abc")).rejects.toMatchObject({ code: "MUTATION_UNKNOWN" });
});

test("saved-list business codes retain their mapped domain errors", async () => {
  const invalid = new ListSession(async () => ({ status: 200, body: { retCode: "CBC.6001" } }), async () => {});
  await expect(invalid.update("abc", {})).rejects.toMatchObject({ code: "VALIDATION", details: { exceptionId: "CBC.6001" } });
  const missing = new ListSession(async () => ({ status: 200, body: { retCode: "CBC.6006" } }), async () => {});
  await expect(missing.lists()).rejects.toMatchObject({ code: "SPEC_NOT_FOUND", details: { exceptionId: "CBC.6006" } });
  const ok = new ListSession(async () => ({ status: 200, body: { retCode: "CBC.0000", lists: [] } }), async () => {});
  expect(await ok.lists()).toEqual([]);
});

test("legacy ECS publish preserves bandwidth defaults and both disk forms", async () => {
  const { publishLegacyEcs } = await import("../../src/core/lists.ts");
  let calls = 0;
  const result = await publishLegacyEcs("legacy", [
    { region: "r", flavor: "c7.linux", system_disk: { type: "GPSSD", size: "40" }, data_disks: [["SSD", 100]], quantity: 2 },
    { region: "r", flavor: "c7.win", bandwidth_mbit: null },
  ], async input => {
    calls++;
    expect(input.items[0]).toMatchObject({ service: "ecs", bandwidth_mbit: 5, system_disk: ["GPSSD", 40], data_disks: [["SSD", 100]] });
    expect(input.items[1]).not.toHaveProperty("bandwidth_mbit");
    return { id: "abc", url: "https://example.test/share", total_usd: 30, items: [{ mode: "MONTHLY", amount: 20 }, { mode: "MONTHLY", amount: 10 }] };
  });
  expect(calls).toBe(1);
  expect(result).toMatchObject({ id: "abc", total_usd: 30, items: [{ flavor: "c7", billing: "MONTHLY", quantity: 2, amount_usd: 20 }, { flavor: "c7", quantity: 1, amount_usd: 10 }] });
});
