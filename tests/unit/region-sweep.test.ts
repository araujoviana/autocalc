import { expect, test } from "bun:test";
import { pageEncodeFailed } from "../../src/core/errors.ts";
import { encode, MATRIX, tier1, tier2 } from "../support/region-sweep.ts";

const fail = (step: string, field?: string) =>
  pageEncodeFailed("boom", { service: "ecs", step, ...(field ? { field } : {}) });

function encodeCalls(outcomes: Array<Record<string, any> | Error>) {
  const calls: number[] = [];
  const encodeCard = async (_service: string, _rv: Record<string, any>, options: { timeout: number }) => {
    calls.push(options.timeout);
    const out = outcomes[calls.length - 1]!;
    if (out instanceof Error) throw out;
    return out;
  };
  return {
    calls,
    run: () => encode("ecs", {}, { encodeCard, sleep: async () => {} }),
  };
}

test("a load timeout is retried with the short timeout", async () => {
  const { calls, run } = encodeCalls([fail("open"), fail("price"), { ok: 1 }]);
  expect(await run()).toEqual({ ok: 1 });
  expect(calls).toEqual([10, 10, 10]);
});

test("a form mismatch is not retried", async () => {
  const { calls, run } = encodeCalls([fail("form"), { ok: 1 }]);
  await expect(run()).rejects.toThrow("boom");
  expect(calls).toHaveLength(1);
});

test("gives up after three tries", async () => {
  const { calls, run } = encodeCalls([fail("open"), fail("open"), fail("open")]);
  await expect(run()).rejects.toThrow("boom");
  expect(calls).toHaveLength(3);
});

test("a disabled Add to List and a missing period option are retried", async () => {
  const period = pageEncodeFailed("not offered", {
    service: "ecs",
    field: "global_PERIODTIME_UNSET_PeriodTime",
  });
  const { calls, run } = encodeCalls([fail("add_to_list"), period, { ok: 1 }]);
  expect(await run()).toEqual({ ok: 1 });
  expect(calls).toHaveLength(3);
});

test("MATRIX has 100 verified service/mode entries matching spa_matrix", () => {
  expect(MATRIX).toHaveLength(100);
  expect(MATRIX[0]?.[0]).toBe("ecs");
  expect(MATRIX.find(([s, b]) => s === "er" && b === "ondemand")?.[2]).toEqual({
    downflow_gb: 100,
    attachment_hours: 730,
    attachments: 2,
  });
  expect(MATRIX.find(([s, b]) => s === "sfs" && b === "ondemand")?.[2]).toEqual({ capacity_gb: 100 });
});

test("tier1 and tier2 format sold, not-sold, pass, and mismatch outcomes", async () => {
  const menu = {
    menuInfos: [
      {
        subCategoryLists: [
          {
            urlPath: "ecs",
            regionOnline: {
              regionList: ["sa-brazil-1"],
              "sa-brazil-1": { common: ["ONDEMAND", "PERIOD"] },
            },
          },
        ],
      },
    ],
  };
  expect(tier1(menu, "ecs", "sa-brazil-1", "monthly")).toBeNull();
  expect(tier1(menu, "ecs", "la-south-2", "monthly")).toStartWith("not sold:");

  const passRes = await tier2(
    {
      productInfo: async () => ({ product: {} }),
      rate: async body => ({
        productRatingResult: (body.productInfos as Array<{ id: string }>).map(p => ({ id: p.id, amount: 12.5 })),
      }),
      encodeCard: async () => ({
        selectedProduct: {
          amount: 12.5,
          region: "sa-brazil-1",
          chargeModeName: "ONDEMAND",
          periodNum: 1,
          timeTag: 1,
          productAllInfos: [
            {
              selectIndex: 0,
              productId: "p1",
              inquiryTag: "normal",
              cloudServiceType: "hws.service.type.eip",
              resourceType: "hws.resource.type.ip",
              resourceSpecCode: "5_bgp",
              productNum: 1,
              inquiryResult: { id: "1-0-p1", amount: 12.5 },
            },
          ],
        },
      }),
    },
    "esw",
    "sa-brazil-1",
    "ondemand",
    {},
  );
  expect(passRes).toBe("pass 12.50");
});
