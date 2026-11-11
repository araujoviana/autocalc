import { expect, test } from "bun:test";
import { publishChecked, verify } from "../../src/core/gate.ts";
import { CalculatorError } from "../../src/core/errors.ts";

type SaveOutcome = "success" | "unknown-created" | "unknown-none" | "unknown-duplicate";
type CheckOutcome = "pass" | "rating-mismatch" | "edit-unavailable" | "missing-edit" | "duplicate-edit" | "checker-throws";
const amount = { n: 1000n, s: 2 };
const request = () => ({
  rewriteValue: { template_RENDER: { capacity: 100, calculator_eip_switch: { UNSET_Switch: "calc_15_" } } },
  selectedProduct: {
    amount: 10, originalAmount: 10, _customTitle: "synthetic", serviceCode: "ecs",
    region: "sa-brazil-1", chargeMode: "prePaid", chargeModeName: "MONTHLY",
    productAllInfos: [{ resourceSpecCode: "synthetic.ecs", resourceType: "hws.resource.type.vm",
      productNum: 1, inquiryTag: "synthetic", selectIndex: 0, addToList_product: true,
      inquiryResult: { amount: 10, originalAmount: 10 } }],
  },
});

// Reference policy is independent of the production gate. Ambiguous saves must
// never select an old list; failed checks never return a link. Only an explicit
// keep-on-fail choice or failed deletion may retain a known newly created list.
function model(save: SaveOutcome, check: CheckOutcome, keep: boolean, deleteFails: boolean) {
  if (save === "unknown-none") return { code: "MUTATION_UNKNOWN", own: 0, events: ["create"] };
  if (save === "unknown-duplicate") return { code: "MUTATION_UNKNOWN", own: 2, events: ["create"] };
  if (check === "pass") return { code: null, own: 1, events: ["create", "check"] };
  return { code: "GATE_FAILED", own: keep || deleteFails ? 1 : 0, events: keep ? ["create", "check"] : ["create", "check", "delete"] };
}

for (const save of ["success", "unknown-created", "unknown-none", "unknown-duplicate"] as const) {
  for (const check of ["pass", "rating-mismatch", "edit-unavailable", "missing-edit", "duplicate-edit", "checker-throws"] as const) {
    for (const keep of [false, true]) {
      for (const deleteFails of [false, true]) {
        test(`publish failure policy: ${save}/${check}/keep=${keep}/deleteFails=${deleteFails}`, async () => {
          const events: string[] = [];
          const old = ["old-same-name", "old-other-name"];
          const rows = new Map(old.map(id => [id, { key: id, name: id === old[0] ? "Synthetic" : "Unrelated" }]));
          const expected = model(save, check, keep, deleteFails);
          const lists = {
            lists: async () => [...rows.values()],
            create: async () => {
              events.push("create");
              if (save !== "unknown-none") rows.set("abc001", { key: "abc001", name: "Synthetic" });
              if (save === "unknown-duplicate") rows.set("abc002", { key: "abc002", name: "Synthetic" });
              if (save !== "success") throw new CalculatorError("MUTATION_UNKNOWN", "Injected ambiguous save outcome");
              return "abc001";
            },
            delete: async (id: string) => {
              events.push("delete");
              // This checks a consequential action: existing account data must
              // never be removed while recovering a synthetic save operation.
              expect(old).not.toContain(id);
              if (deleteFails) throw new Error("Injected delete failure");
              rows.delete(id);
            },
          };
          let result: Awaited<ReturnType<typeof publishChecked>> | undefined;
          let failure: unknown;
          try {
            result = await publishChecked("Synthetic", [request()], {
              lists, env: keep ? { AUTOCALC_KEEP_ON_FAIL: "1" } : {},
              check: async (id, submitted) => {
                events.push("check");
                expect(id).toBe("abc001");
                if (check === "checker-throws") throw new Error("Injected browser failure");
                const edit = { index: 0, stored: amount, edit: amount, equal: true };
                // Keep the real verification and gate logic. Only external read,
                // rating and browser operations receive controlled outcomes.
                return verify(id, {
                  reader: { getUncached: async () => ({ retCode: "200", data: { cartListData: [request()] } }) },
                  rate: async () => ({}),
                  rerate: async () => check === "rating-mismatch" ? { n: 999n, s: 2 } : amount,
                  edit: async () => check === "missing-edit" ? []
                    : check === "duplicate-edit" ? [edit, edit]
                    : check === "edit-unavailable" ? [{ ...edit, edit: null, equal: false, reason: "Injected page load failure" }]
                    : [edit],
                }, submitted);
              },
            });
          } catch (error) { failure = error; }

          expect(failure instanceof CalculatorError ? failure.code : failure === undefined ? null : "unexpected").toBe(expected.code);
          expect(events).toEqual(expected.events);
          expect([...rows.keys()].filter(id => !old.includes(id))).toHaveLength(expected.own);
          expect(old.every(id => rows.has(id))).toBe(true);
          if (expected.code === null) {
            expect(result?.id).toBe("abc001");
            expect(result?.checks[0]?.ok).toBe(true);
          } else {
            expect(result).toBeUndefined();
            if (expected.code === "GATE_FAILED" && !keep && deleteFails) {
              expect((failure as CalculatorError).details).toMatchObject({ list_id: "abc001" });
            }
          }
        });
      }
    }
  }
}
