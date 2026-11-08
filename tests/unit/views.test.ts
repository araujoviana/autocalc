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
  expect(q).toContain("Santiago, Chile · la-south-2 · monthly · 1 month(s)");
  expect(q).toMatch(/ecs\s+c7n\.large\.2\.linux\s+3\s+-\s+120\.78/);
  expect(q).toContain("TOTAL 172.08 USD");
  expect(humanView("rename", { ok: true }, plain)).toBeNull();
  expect(humanView("lists", { not: "an array" }, plain)).toBeNull();
});

test("describe, convert, compare-modes, compare-regions, compile, export, read, auth, and list mutations render human views", () => {
  const desc = humanView("describe", {
    service: "ecs",
    region: "sa-brazil-1",
    modes_in_region: ["ONDEMAND", "MONTHLY"],
    sold_in_region: true,
    groups: { ec2_vm: { count: 100, sample_specs: ["c7n.large.2"] } },
    builders: [{ service: "ecs", description: "Elastic Cloud Server", modes: ["ondemand", "monthly"] }],
  }, plain)!;
  expect(desc).toContain("Elastic Cloud Server (ecs) · São Paulo, Brazil (sa-brazil-1)");
  expect(desc).toContain("CATALOG GROUP  SKUS  SAMPLE SPECS");

  const conv = humanView("convert", { usd: 100, currency: "BRL", rate: 5.5, amount: 550 }, plain)!;
  expect(conv).toContain("100.00 USD = 550.00 BRL  (rate: 1 USD = 5.5 BRL)");

  const cm = humanView("compare-modes", {
    region: "sa-brazil-1",
    hours: 730,
    periods: 1,
    modes: [
      { mode: "ondemand", total_usd: 100, monthly_equivalent_usd: 100, saving_vs_ondemand_pct: 0 },
      { mode: "monthly", total_usd: 70, monthly_equivalent_usd: 70, saving_vs_ondemand_pct: 30 },
    ],
  }, plain)!;
  expect(cm).toContain("São Paulo, Brazil · sa-brazil-1");
  expect(cm).toContain("-30.0% cheaper");

  const cr = humanView("compare-regions", {
    billing: "monthly",
    regions: [
      { region: "sa-brazil-1", total_usd: 180 },
      { region: "la-south-2", total_usd: 120 },
    ],
  }, plain)!;
  expect(cr).toContain("REGION ID    LOCATION           TOTAL USD  COMPARISON");
  expect(cr).toContain("✓ cheapest");
  expect(cr).toContain("+50.0% vs cheapest");

  const comp = humanView("compile", {
    ok: true,
    version: "1",
    customer: "Acme",
    horizon: "1y",
    input_hash: "1234567890abcdef",
    resources: [{ id: "web", service: "ecs", region: "sa-brazil-1", billing: "monthly", quantity: 2, spec: "c7n.large.2" }],
  }, plain)!;
  expect(comp).toContain("Compiled quote (v1) · Customer: Acme");
  expect(comp).toContain("sa-brazil-1  São Paulo, Brazil");

  const exp = humanView("export", { path: "/tmp/quotes.xlsx", rows: 2, total_usd: 300 }, plain)!;
  expect(exp).toContain("Exported 2 environment quotes to /tmp/quotes.xlsx (Total: 300.00 USD)");

  const rd = humanView("read", {
    id: "abc",
    name: "Prod List",
    total: 120.5,
    items: [{ title: "web", service: "ecs", region: "sa-brazil-1", mode: "monthly", amount: 120.5, products: [{ spec: "c7n.large.2", num: 2 }] }],
  }, plain)!;
  expect(rd).toContain("Prod List (abc)");
  expect(rd).toContain("TOTAL 120.50 USD");

  expect(humanView("delete", { deleted: "abc" }, plain)).toContain("Deleted saved price list abc");
  expect(humanView("rename", { id: "abc", name: "New Name" }, plain)).toContain('Renamed price list abc to "New Name"');
  expect(humanView("duplicate", { id: "xyz", name: "Copy", url: "https://example.test/xyz" }, plain)).toContain("https://example.test/xyz");
  expect(humanView("auth status", { logged_in: true, profile: "default", age_hours: 12.3, cookies: "5 cookies", backend: "profile" }, plain)).toContain("Signed in (profile default)");
  const staleStatus = humanView("auth status", { logged_in: true, profile: "default", age_hours: 127.3, cookies: "47 cookies", backend: "profile" }, plain)!;
  expect(staleStatus).toContain("Signed in (profile default)");
  expect(staleStatus).toContain("127.3 h (may be expired; typical session is 24h)");

  const docExpired = humanView("doctor", { ok: false, checks: [{ name: "menu", ok: true }], auth: { logged_in: true, authenticated: false, profile: "default", age_hours: 127.3 } }, plain)!;
  expect(docExpired).toContain("session expired (profile default, session 127.3 h old; run autocalc login)");
});
