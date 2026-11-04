import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registry } from "../../src/core/registry.ts";
import { candidate } from "../../src/core/quote/model.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import type { ActionContext } from "../../src/core/types.ts";

const provider = { name: "fake", async candidates(req: { region: string; billing: string }) {
  return [candidate("c7n.large.2", req.region, req.billing, "10", { vcpus: 2, memory_gb: 4 }), candidate("c7n.xlarge.2", req.region, req.billing, "20", { vcpus: 4, memory_gb: 8 })];
} };
async function ctx(): Promise<ActionContext> {
  return { provider, drafts: new DraftStore(await mkdtemp(join(tmpdir(), "wf-"))), catalog: { regions: async () => ({ "sa-brazil-1": "Brazil" }) } } as unknown as ActionContext;
}
const req = (o = {}) => ({ id: "r1", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 3 }, ...o });
const run = (c: ActionContext, name: keyof typeof registry, input: unknown) => registry[name].invoke(c, input) as Promise<any>;

test("draft, revise, inspect and list round trip", async () => {
  const c = await ctx();
  const d = await run(c, "draft_quote", { customer: "acme", requirements: [req()] });
  expect(d.pending).toEqual(["r1"]);
  expect(d.requirements[0].candidates.map((x: any) => x.spec).sort()).toEqual(["c7n.large.2", "c7n.xlarge.2"]);
  expect((await run(c, "revise_quote", { draft_id: d.draft_id, decisions: [{ requirement_id: "r1", spec: "c7n.xlarge.2", justification: "fits" }] })).pending).toEqual([]);
  expect((await run(c, "inspect_draft", { draft_id: d.draft_id })).state).toBe("ready");
  expect((await run(c, "list_drafts", {}))[0].id).toBe(d.draft_id);
});

test("an exact need is decided automatically", async () => {
  const d = await run(await ctx(), "draft_quote", { customer: "acme", requirements: [req({ needs: { vcpus: 2, memory_gb: 4 } })] });
  expect(d.pending).toEqual([]);
  expect(d.requirements[0].decision.by).toBe("auto");
});

test("bad input fails validation and recover refuses without confirmation", async () => {
  const c = await ctx();
  await expect(run(c, "draft_quote", { customer: "acme", requirements: [] })).rejects.toThrow();
  const d = await run(c, "draft_quote", { customer: "acme", requirements: [req()] });
  await expect(run(c, "recover_draft", { draft_id: d.draft_id, confirmed_no_remote_list: false, justification: "x" })).rejects.toThrow(/confirm/);
});

function detail(name: string, total: number) {
  const vm = {
    resourceType: "hws.resource.type.vm",
    resourceSpecCode: "c7n.xlarge.2.linux",
    productNum: 3,
    productSpecSysDesc: "Memory:8192MB;vCPUs:4CORE;Series:C7n",
    inquiryResult: { amount: 300.0 },
  };
  const disk = {
    resourceType: "hws.resource.type.volume",
    resourceSpecCode: "GPSSD",
    productNum: 3,
    resourceSize: 40,
    resouceSizeMeasureId: 17,
    inquiryResult: { amount: 20.5 },
  };
  const usage = { resourceType: null, productNum: 2190, inquiryResult: { amount: 0 } };
  return {
    name,
    totalPrice: { amount: total },
    cartListData: [
      {
        selectedProduct: {
          serviceCode: "ecs",
          region: "sa-brazil-1",
          chargeModeName: "PERIOD",
          productAllInfos: [vm, usage, disk],
        },
      },
    ],
  };
}

async function readXlsx(path: string): Promise<Record<string, Array<Array<string | number | null>>>> {
  const { readFileSync } = await import("node:fs");
  const { readZipEntries } = await import("../../src/core/xlsx.ts");
  const entries = readZipEntries(new Uint8Array(readFileSync(path)));
  const sheetNames = [...entries["xl/workbook.xml"]!.matchAll(/<sheet name="([^"]+)"/g)].map(
    m => m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'),
  );
  const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const out: Record<string, Array<Array<string | number | null>>> = {};
  sheetNames.forEach((name, idx) => {
    const xml = entries[`xl/worksheets/sheet${idx + 1}.xml`]!;
    const rows: Array<Array<string | number | null>> = [];
    for (const rowMatch of xml.matchAll(/<row r="\d+">(.*?)<\/row>/g)) {
      const cells: Array<string | number | null> = [];
      for (const cellMatch of rowMatch[1]!.matchAll(/<c r="([A-Z]+)\d+"[^>]*>(.*?)<\/c>/g)) {
        const colIdx = cellMatch[1]!.charCodeAt(0) - 65;
        while (cells.length < colIdx) cells.push(null);
        const body = cellMatch[2]!;
        const t = /<t[^>]*>(.*?)<\/t>/.exec(body);
        const f = /<f>(.*?)<\/f>/.exec(body);
        const v = /<v>(.*?)<\/v>/.exec(body);
        cells.push(t ? unescape(t[1]!) : f ? unescape(f[1]!) : Number(v![1]!));
      }
      rows.push(cells);
    }
    out[name] = rows;
  });
  return out;
}

function withFakeLists(base: ActionContext, details: Record<string, Record<string, any>>): ActionContext {
  return {
    ...base,
    reader: {
      getUncached: async (url: string) => {
        const id = new URL(url).searchParams.get("key") ?? "";
        if (!(id in details)) throw new Error("no such list");
        return { retCode: "200", data: details[id] };
      },
    } as any,
  };
}

test("export_quotes_xlsx writes the four sheets", async () => {
  const c = withFakeLists(await ctx(), { aaa: detail("Acme prod", 320.5), bbb: detail("Acme dev", 100) });
  const d = await run(c, "draft_quote", {
    customer: "acme",
    requirements: [{ id: "web", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 4 } }],
  });
  await run(c, "revise_quote", {
    draft_id: d.draft_id,
    decisions: [{ requirement_id: "web", spec: "c7n.xlarge.2", justification: "cheapest 4 vCPU" }],
  });
  await c.drafts.link("aaa", d.draft_id);
  const out = join(c.drafts.root, "q.xlsx");
  const res = await run(c, "export_quotes_xlsx", {
    rows: [{ env: "prod", list: "aaa" }, { env: "dev & test", list: "bbb" }],
    path: out,
  });
  expect(res.rows).toBe(2);
  expect(res.total_usd).toBe(420.5);
  const book = await readXlsx(out);
  expect(Object.keys(book)).toEqual(["Quotes", "Decisions", "Resources", "Totals"]);
  const q = book.Quotes!;
  expect(q[0]).toEqual(["Environment", "Calculator", "Total (USD)", "Link"]);
  expect(q[1]!.slice(0, 3)).toEqual(["prod", "Acme prod", 320.5]);
  expect(String(q[1]![3])).toContain("shareListId=aaa");
  expect(q[2]![0]).toBe("dev & test");
  expect(q[3]![0]).toBe("Total");
  expect(q[3]![2]).toBe("SUM(C2:C3)");
  const dec = book.Decisions!;
  expect(dec[1]).toEqual(["prod", "web", "ecs", "sa-brazil-1", "monthly", 1.0, "c7n.xlarge.2", "human", "cheapest 4 vCPU"]);
  expect(dec[2]).toEqual(["dev & test", "(no draft is recorded for this list)"]);
  const resRows = book.Resources!;
  expect(resRows).toHaveLength(1 + 2 * 2);
  const vm = resRows[1]!;
  expect(vm.slice(5, 11)).toEqual(["vm", "c7n.xlarge.2.linux", 3.0, 0.0, 12.0, 24.0]);
  expect(resRows[2]![5]).toBe("volume");
  expect(resRows[2]![8]).toBe(120.0);
  const tot = book.Totals!;
  expect(tot[0]!.slice(0, 6)).toEqual(["Environment", "Instances", "vCPUs", "RAM (GB)", "Storage (GB)", "Backup (GB)"]);
  expect(tot[1]!.slice(0, 6)).toEqual(["prod", 3.0, 12.0, 24.0, 120.0, 0.0]);
  expect(tot[3]![0]).toBe("Total");
  expect(tot[3]![1]).toBe("SUM(B2:B3)");
  expect(tot.some(r => String(r[0]).includes("Not counted"))).toBe(true);
});

test("export_quotes_xlsx takes a named draft", async () => {
  const c = withFakeLists(await ctx(), { ccc: detail("Other", 10) });
  const d = await run(c, "draft_quote", {
    customer: "acme",
    requirements: [{ id: "web", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 4, memory_gb: 8 } }],
  });
  const out = join(c.drafts.root, "q.xlsx");
  await run(c, "export_quotes_xlsx", { rows: [{ env: "x", list: "ccc", draft_id: d.draft_id }], path: out });
  const row = (await readXlsx(out)).Decisions![1]!;
  expect(row.slice(0, 8)).toEqual(["x", "web", "ecs", "sa-brazil-1", "monthly", 1.0, "c7n.xlarge.2", "auto"]);
});

test("export_quotes_xlsx writes nothing when a list is gone and default uses user data without overwriting", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const c = withFakeLists(await ctx(), { aaa: detail("test", 10) });
  const out = join(c.drafts.root, "q.xlsx");
  await expect(run(c, "export_quotes_xlsx", { rows: [{ env: "prod", list: "abcdef" }], path: out })).rejects.toThrow(/prod/);
  expect(existsSync(out)).toBe(false);
  await expect(run(c, "export_quotes_xlsx", { rows: [{ env: "x", list: "aaa" }], path: join(c.drafts.root, "q.csv") })).rejects.toThrow();

  const first = await run(c, "export_quotes_xlsx", { rows: [{ env: "test", list: "aaa" }] });
  const second = await run(c, "export_quotes_xlsx", { rows: [{ env: "test", list: "aaa" }] });
  expect(dirname(first.path)).toBe(join(c.drafts.root, "exports"));
  expect(first.path).not.toBe(second.path);
  const before = readFileSync(first.path);
  await expect(run(c, "export_quotes_xlsx", { rows: [{ env: "test", list: "aaa" }], path: first.path })).rejects.toThrow(/already exists/);
  expect(readFileSync(first.path)).toEqual(before);
});

test("reserved instance lines take their size from the cpu and mem fields", async () => {
  const { resources } = await import("../../src/core/summary.ts");
  const ri = {
    resourceType: "hws.resource.type.vm",
    resourceSpecCode: "c7n.4xlarge.2.linux",
    productNum: 2,
    productSpecSysDesc: "",
    cpu: "16dataInfo_36_",
    mem: "32BSSUNIT.pluralUnit.102",
    inquiryResult: { amount: 1 },
  };
  const rows = resources({ cartListData: [{ selectedProduct: { productAllInfos: [ri] } }] });
  expect([rows[0]!.vcpus, rows[0]!.ram_gb, rows[0]!.instances]).toEqual([32, 64, 2]);
});
