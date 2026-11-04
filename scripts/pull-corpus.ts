import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCore } from "../src/core/index.ts";
import { ListReference } from "../src/core/schemas.ts";
import { endpoints } from "../src/core/endpoints.ts";
import { request } from "playwright";
import { corpusIndexEntry } from "./corpus-index.ts";
const core = createCore();
const http = await request.newContext({ timeout: 60000 });
const directory = join(import.meta.dir, "../tests/fixtures/corpus");
try {
  const lists = await core.invoke("list_my_price_lists", {});
  if (!Array.isArray(lists)) throw new Error("Invalid list response");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const saved: Array<ReturnType<typeof corpusIndexEntry>> = [], failures: string[] = [];
  for (const row of lists) {
    const id = ListReference.safeParse(row && typeof row === "object" ? (row as Record<string, unknown>).id : undefined);
    if (!id.success) { failures.push("invalid ID"); continue; }
    try {
      const response = await http.get(endpoints.detail(id.data));
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || String((value as Record<string, unknown>).retCode) !== "200") throw new Error("Invalid detail response");
      const detail = (value as Record<string, unknown>).data;
      if (!detail || typeof detail !== "object" || !Array.isArray((detail as Record<string, unknown>).cartListData)) throw new Error("Invalid detail data");
      await writeFile(join(directory, `${id.data}.json`), JSON.stringify(detail, null, 2), { mode: 0o600 });
      saved.push(corpusIndexEntry(row as Record<string, unknown>));
      await Bun.sleep(300);
    } catch { failures.push(id.data); }
  }
  await writeFile(join(directory, "index.json"), JSON.stringify(saved, null, 2), { mode: 0o600 });
  console.error(`Saved ${saved.length} lists; ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
} finally { await http.dispose(); await core.close(); }
