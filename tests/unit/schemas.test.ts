import { expect, test } from "bun:test";
import { Numeric, BooleanInput, QuoteItem, ListReference, CardInput } from "../../src/core/schemas.ts";

test("numeric inputs accept decimal strings and reject unsafe coercions", () => {
  expect(Numeric.parse("1.25")).toBe(1.25);
  for (const value of [null, true, "", "  ", "0x10", "Infinity", NaN]) expect(Numeric.safeParse(value).success).toBe(false);
});

test("service cards reject unsupported modes and ignored options", () => {
  expect(CardInput.parse({ service: "ecs", region: "Santiago", flavor: "c7" })).toMatchObject({ billing: "monthly", quantity: 1, system_disk: ["GPSSD", 40] });
  expect(CardInput.safeParse({ service: "eip", region: "x", billing: "yearly" }).success).toBe(false);
  expect(CardInput.safeParse({ service: "elb", region: "x", quantity: 2 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "cci", region: "x", quantity: 2 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "eip", region: "x", ip_reservation: false, traffic_gb: 0 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "obs", region: "x" }).success).toBe(false);
  expect(CardInput.safeParse({ service: "obs", region: "x", package: "1TB", billing: "ondemand" }).success).toBe(false);
  expect(CardInput.safeParse({ service: "cbr", region: "x", size_gb: 1.5 }).success).toBe(true);
  expect(CardInput.safeParse({ service: "redis", region: "x", bandwidth_mbit: 0 }).success).toBe(false);
});

test("boolean string false remains false", () => {
  expect(BooleanInput.parse("false")).toBe(false);
  expect(BooleanInput.safeParse("False").success).toBe(false);
});

test("quote item defaults and list reference validation", () => {
  expect(QuoteItem.parse({ service: "ecs", spec: "x" }).quantity).toBe(1);
  expect(QuoteItem.safeParse({ service: "ecs", spec: "x", extra: 1 }).success).toBe(false);
  expect(ListReference.parse("abcdef12")).toBe("abcdef12");
  expect(ListReference.safeParse("https://example.com/?shareListId=abcdef12").success).toBe(false);
});

test("rejects quantities that would be silently ignored", () => {
  for (const service of ["apm", "waf", "eip"]) {
    expect(CardInput.safeParse({ service, region: "sa-brazil-1", quantity: 2 }).success).toBe(false);
  }
  expect(CardInput.safeParse({ service: "obs", region: "sa-brazil-1", quantity: 2, components: [{ factor: "size", value: 1 }] }).success).toBe(false);
  expect(CardInput.safeParse({ service: "evs", region: "sa-brazil-1", type: "GPSSD", iops: 5000 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "evs", region: "sa-brazil-1", type: "GPSSD2", billing: "monthly", iops: 5000 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "eip", region: "sa-brazil-1", ip_reservation: false, traffic_gb: 1, eip_count: 2 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "evs", region: "sa-brazil-1", billing: "monthly", hours: 100 }).success).toBe(false);
  expect(CardInput.safeParse({ service: "evs", region: "sa-brazil-1", billing: "ondemand", periods: 2 }).success).toBe(false);
});
