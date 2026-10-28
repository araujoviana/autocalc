import { expect, test } from "bun:test";
import { doctor } from "../../src/core/diagnostics.ts";
test("doctor includes the rating endpoint in public health", async () => {
  const called: string[] = [];
  const result = await doctor(async name => { called.push(name); return { ok: String(name) !== "rating" }; }, {});
  expect(called).toContain("rating");
  expect(result.checks).toContainEqual({ name: "rating", ok: false });
  expect(result.ok).toBe(false);
});
test("doctor reports failed probes without claiming authentication", async () => {
  const result = await doctor(async name => name === "menu" ? { ok: true } : { ok: false }, { available: true, authenticated: null });
  expect(result.ok).toBe(false);
  expect(result.auth).toMatchObject({ available: true, authenticated: null });
});
test("doctor reports the live authenticated probe without changing public health", async () => {
  const result = await doctor(async () => ({ ok: true }), { available: true }, async () => ({ status: 200, body: { retCode: "CBC.0101" } }));
  expect(result.ok).toBe(true);
  expect(result.auth).toMatchObject({ available: true, authenticated: false });
});
