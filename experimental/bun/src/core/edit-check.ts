import { roundPython } from "./rounding.ts";

type Line = [string, string, number | null, number];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function lines(value: unknown, stored: boolean): Line[] {
  const data = object(value), source = stored ? object(data.selectedProduct).productAllInfos : data.productInfos;
  if (!Array.isArray(source)) return [];
  return source.map(object).filter(row => !stored || !!row.resourceSpecCode).map(row => [String(row.resourceType ?? "?").split(".").at(-1) ?? "?", String(row.resourceSpecCode ?? ""), finite(row.resourceSize) ? row.resourceSize : null, finite(row.productNum) && row.productNum !== 0 ? row.productNum : 1]);
}
export function diffLines(stored: Line[], edit: Line[]): { added: Line[]; removed: Line[] } {
  const counts = new Map<string, { line: Line; count: number }>();
  for (const [rows, delta] of [[stored, -1], [edit, 1]] as const) for (const line of rows) { const key = JSON.stringify(line), entry = counts.get(key) ?? { line, count: 0 }; entry.count += delta; counts.set(key, entry); }
  const added: Line[] = [], removed: Line[] = [];
  for (const { line, count } of counts.values()) for (let i = 0; i < Math.abs(count); i++) (count > 0 ? added : removed).push(line);
  added.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); removed.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { added, removed };
}
export function judge(index: number, card: unknown, request: unknown, edit: unknown, tolerance = 0.01) {
  const selected = object(object(card).selectedProduct), stored = selected.amount, title = String(selected._customTitle ?? selected.serviceCode ?? `card ${index}`);
  if (!finite(stored) || !finite(edit)) return { index, title, status: "unavailable" as const, stored: finite(stored) ? stored : null, edit: null, delta: null, added: [], removed: [], reason: !finite(stored) ? "stored card has no numeric amount" : "Edit amount is not finite" };
  const { added, removed } = diffLines(lines(card, true), lines(request, false));
  let usageMismatch = false, lostCapacity = false;
  if (selected.serviceCode === "obs") {
    const saved = Array.isArray(selected.productAllInfos) ? selected.productAllInfos.map(object) : [];
    const sent = Array.isArray(object(request).productInfos) ? (object(request).productInfos as unknown[]).map(object) : [];
    const signature = (row: Record<string, unknown>) => JSON.stringify([row.usageFactor ?? null, row.usageValue ?? null, row.usageMeasureId ?? null]);
    usageMismatch = saved.map(signature).sort().join("|") !== sent.map(signature).sort().join("|");
    lostCapacity = saved.some(row => typeof row.usageFactor === "string" && row.usageFactor.startsWith("size") && finite(row.usageValue) && row.usageValue > 0 && sent.some(other => other.usageFactor === row.usageFactor && other.usageValue === 0));
  }
  return { index, title, status: Math.abs(edit - stored) <= tolerance && !added.length && !removed.length && !usageMismatch ? "ok" as const : "mismatch" as const, stored, edit, delta: roundPython(edit - stored, 6), added, removed, reason: lostCapacity ? "OBS storage capacity reset during Edit (known calculator defect; inspect other differences too)" : usageMismatch ? "OBS usage lines differ after Edit" : "" };
}
export function allOk(results: Array<{ status: string }>): boolean { return results.length > 0 && results.every(result => result.status === "ok"); }
