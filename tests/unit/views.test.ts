import { expect, test } from "bun:test";
import { humanView } from "../../src/core/views.ts";

const plain = { isTTY: false } as const;

test("lists: newest first, one row per list, money with two decimals, an id column", () => {
  const out = humanView("lists", [
    { name: "old", id: "A1", total: { amount: 10 }, updated: Date.UTC(2026, 0, 2) },
    { name: "new", id: "B2", total: { amount: 140.5438 }, updated: Date.UTC(2026, 10, 4) },
  ], plain)!;
  const rows = out.split("\n");
  expect(rows[0]).toMatch(/NAME\s+TOTAL USD\s+UPDATED\s+ID/);
  expect(rows[1]).toMatch(/new\s+140\.54\s+2026-11-04\s+B2/);
  expect(rows[2]).toMatch(/old\s+10\.00\s+2026-01-02\s+A1/);
  expect(out).toContain("2 lists, newest first");
  expect(humanView("lists", [], plain)).toBe("No saved lists on this account.");
});

test("validate and edit-check read as a verdict plus rows", () => {
  expect(humanView("validate", { ok: true, items: 1, total: 140.54, issues: [] }, plain)).toBe("[ok]   1 item, total 140.54; no issues");
  const bad = humanView("validate", { ok: false, items: 2, total: 5, issues: ["[web] differs"] }, plain)!;
  expect(bad).toContain("[FAIL] 2 items, total 5.00");
  expect(bad).toContain("  [web] differs");
  const out = humanView("edit-check", { ok: true, results: [{ index: 0, title: "web", status: "ok", stored: 140.54, edit: 140.54, delta: 0, reason: "", warnings: ["No data matched"] }] }, plain)!;
  expect(out).toMatch(/web\s+ok\s+140\.54\s+140\.54\s+0\.00/);
  expect(out).toContain("1 card re-price to the stored amount");
  expect(out).toContain("web: No data matched");
});

test("doctor, search and quote have views; an unknown command or shape falls back to JSON", () => {
  expect(humanView("doctor", { ok: true, checks: [{ name: "menu", ok: true }, { name: "rating", ok: false }], auth: { logged_in: true, profile: "default", age_hours: 23.68 } }, plain)).toBe(
    "[ok]   menu endpoint\n[FAIL] rating endpoint\n[ok]   signed in (profile default, session 23.7 h old)");
  const found = humanView("search", [{ spec: "t7.xlarge.2.linux", description: "Memory:8192MB;vCPUs:4CORE;x", monthly: 14.38, ondemand: 0.0274 }], plain)!;
  expect(found).toMatch(/SPEC\s+ONDEMAND\s+MONTHLY\s+SIZE/);
  expect(found).toMatch(/t7\.xlarge\.2\.linux\s+0\.0274\s+14\.38\s+4 vCPU, 8 GB/);
  const q = humanView("quote", { region: "la-south-2", billing: "monthly", term: "1 month(s)", currency: "USD", total: 172.08, discount: 0, items: [{ service: "ecs", spec: "c7n.large.2.linux", quantity: 3, size: null, amount: 120.78 }] }, plain)!;
  expect(q).toContain("la-south-2 · monthly · 1 month(s)");
  expect(q).toMatch(/ecs\s+c7n\.large\.2\.linux\s+3\s+-\s+120\.78/);
  expect(q).toContain("TOTAL 172.08 USD");
  expect(humanView("rename", { ok: true }, plain)).toBeNull();
  expect(humanView("lists", { not: "an array" }, plain)).toBeNull();
});
