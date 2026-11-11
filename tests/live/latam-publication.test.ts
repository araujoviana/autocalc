import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createCore } from "../../src/core/index.ts";

// Opt-in because these checks create temporary lists on the logged-in account.
// AUTOCALC_LIVE=1 alone keeps the ordinary live suite read-only.
const enabled = process.env.AUTOCALC_LIVE_PUBLICATION === "1";
type List = { id: string; name: string };
type GateCheck = { ok: boolean; problems: string[]; stored: string; rated: string | null; edit: string | null; edit_skipped?: string };

for (const region of ["sa-brazil-1", "la-south-2"]) {
  for (const service of ["cce", "kafka", "rabbitmq"]) {
    test.skipIf(!enabled)(`synthetic full publication gate: ${service}/${region}`, async () => {
      const core = createCore();
      const name = `[autocalc] ${service} ${region} ${randomUUID().slice(0, 8)}`;
      let before: Set<string> | undefined;
      const lists = async () => await core.invoke("list_my_price_lists", {}, { signal: AbortSignal.timeout(60000) }) as List[];
      try {
        before = new Set((await lists()).map(row => row.id));
        const options = service === "cce"
          ? { cluster_type: "standard", ha: true, scale: "small" }
          : { spec_id: "c6.2u4g.cluster", brokers: 3, storage_gb: 200, storage_type: "ultra", ...(service === "rabbitmq" ? { version: "3.8" } : {}) };
        const draft = await core.invoke("draft_quote", {
          customer: "Synthetic compatibility verification",
          requirements: [{ id: "synthetic-resource", service, region, billing: "monthly", quantity: 1,
            spec: service === "cce" ? "cce.s2.small" : `dms.platinum.c6.${service}`, options }],
        }, { signal: AbortSignal.timeout(60000) }) as { draft_id: string };
        const result = await core.invoke("publish_quote", {
          draft_id: draft.draft_id, name, currency: "USD", settlement: "total",
        }, { signal: AbortSignal.timeout(240000) }) as { checks: GateCheck[] };
        expect(result.checks).toHaveLength(1);
        for (const check of result.checks) {
          expect(check.ok).toBe(true);
          expect(check.problems).toEqual([]);
          expect(check.edit_skipped).toBeUndefined();
          expect(check.rated).not.toBeNull();
          expect(check.edit).not.toBeNull();
          expect(check.stored).toBe(check.rated!);
          expect(check.stored).toBe(check.edit!);
        }
      } finally {
        try {
          if (before) {
            // Ownership requires both an exact random name and an ID absent
            // before this test. Existing customer lists are never selected.
            const own = (await lists()).filter(row => row.name === name && !before!.has(row.id));
            for (const row of own) await core.invoke("delete_price_list", { url_or_id: row.id }, { signal: AbortSignal.timeout(60000) });
            const remaining = (await lists()).filter(row => row.name === name && !before!.has(row.id));
            expect(remaining.length, "Temporary synthetic lists must be removed").toBe(0);
          }
        } finally { await core.close(); }
      }
    }, 480000);
  }
}
