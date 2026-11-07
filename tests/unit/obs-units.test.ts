import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";

const card = (storage_class: string, factor: string, value: number) => CardInput.safeParse({ service: "obs", region: "sa-brazil-1", billing: "ondemand", storage_class, components: [{ factor, value }] });
const UNITS: Array<[string, string, string]> = [
  ["standard", "get", "10,000"], ["standard", "put", "10,000"], ["standard", "delete", "1,000"],
  ["warm", "get_warm", "1,000"], ["warm", "put_warm", "1,000"], ["warm", "delete_warm", "1,000"], ["warm", "transition_warm", "10,000"],
  ["cold", "get_cold", "1,000"], ["cold", "put_cold", "1,000"], ["cold", "delete_cold", "1,000"], ["cold", "transition_cold", "10,000"],
];
test.each(UNITS)("%s %s: 9,999 passes, 10,000 and fractions fail naming the unit", (cls, factor, unit) => {
  expect(card(cls, factor, 9999).success).toBe(true);
  for (const bad of [10000, 1.5]) {
    const r = card(cls, factor, bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify((r as any).error.issues)).toContain(`units of ${unit} requests`);
  }
});
test("traffic lines are capped at the page's 102,400 GB, replication at 9,999,999", () => {
  expect(card("standard", "download.external", 102400).success).toBe(true);
  expect(card("standard", "download.external", 102401).success).toBe(false);
  expect(card("standard", "download_crr", 9999999).success).toBe(true);
  expect(card("standard", "download_crr", 10000000).success).toBe(false);
});
