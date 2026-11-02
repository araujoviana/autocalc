export function compareCards(actual: unknown, expected: unknown): string[] {
  const differences: string[] = [];
  const visit = (a: unknown, b: unknown, path: string): void => {
    if (Object.is(a, b)) return;
    if (typeof a === "number" && typeof b === "number" && /(?:^|\.)amount$/i.test(path) && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) differences.push(`${path}.length`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) visit(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (key === "timeTag" || key === "_cartId" || (key === "id" && path.endsWith("inquiryResult"))) continue;
        const next = path ? `${path}.${key}` : key;
        if (!(key in left) || !(key in right)) differences.push(next); else visit(left[key], right[key], next);
      }
      return;
    }
    differences.push(path);
  };
  visit(actual, expected, "");
  return differences.sort();
}

/** Compare pricing inputs and amounts independently of changing catalog metadata. */
export function compareProducts(actual: unknown, expected: unknown): string[] {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const a = object(actual), b = object(expected), differences: string[] = [];
  const fields = ["serviceCode", "region", "chargeMode", "chargeModeName", "periodType", "periodNum"];
  for (const field of fields) if (!Object.is(a[field], b[field])) differences.push(field);
  const compareAmount = (left: unknown, right: unknown, path: string) => {
    if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > 0.01 + Number.EPSILON * Math.max(Math.abs(left), Math.abs(right), 1)) differences.push(path);
  };
  compareAmount(a.amount, b.amount, "amount");
  const left = Array.isArray(a.productAllInfos) ? a.productAllInfos.map(object) : [], right = Array.isArray(b.productAllInfos) ? b.productAllInfos.map(object) : [];
  if (left.length !== right.length) differences.push("productAllInfos.length");
  const keys = ["resourceSpecCode", "resourceType", "productNum", "resourceSize", "usageFactor", "usageValue", "addToList_title", "addToList_product", "billingMode", "cloudServiceType", "inquiryTag", "selectIndex"];
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const x = left[index]!, y = right[index]!;
    for (const key of keys) if (!Object.is(x[key], y[key])) differences.push(`productAllInfos[${index}].${key}`);
    const first = object(x.inquiryResult).amount, second = object(y.inquiryResult).amount;
    if (first !== undefined || second !== undefined) compareAmount(first, second, `productAllInfos[${index}].inquiryResult.amount`);
  }
  return differences;
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const corpusDirectory = join(import.meta.dir, "../fixtures/corpus");
export async function loadIndex(directory = corpusDirectory): Promise<unknown> {
  return JSON.parse(await readFile(join(directory, "index.json"), "utf8")) as unknown;
}
export async function loadList(key: string, directory = corpusDirectory): Promise<unknown> {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error("Invalid corpus key");
  return JSON.parse(await readFile(join(directory, `${key}.json`), "utf8")) as unknown;
}
export async function allCards(service?: string, directory = corpusDirectory): Promise<Array<{ key: string; index: number; card: Record<string, unknown> }>> {
  const result: Array<{ key: string; index: number; card: Record<string, unknown> }> = [];
  for (const name of (await readdir(directory)).filter(name => name.endsWith(".json") && name !== "index.json").sort()) {
    const key = name.slice(0, -5);
    const list = await loadList(key, directory);
    if (!list || typeof list !== "object") continue;
    const cards = (list as Record<string, unknown>).cartListData;
    if (!Array.isArray(cards)) continue;
    cards.forEach((card: unknown, index: number) => {
      if (!card || typeof card !== "object" || Array.isArray(card)) return;
      const selected = (card as Record<string, unknown>).selectedProduct;
      if (service && (!selected || typeof selected !== "object" || (selected as Record<string, unknown>).serviceCode !== service)) return;
      result.push({ key, index, card: card as Record<string, unknown> });
    });
  }
  return result;
}
export async function runGolden(service: string, rebuild: (card: Record<string, unknown>) => Promise<unknown>, options: { limit?: number; directory?: string } = {}) {
  const cards = await allCards(service, options.directory);
  const selected = options.limit === undefined ? cards : cards.slice(0, options.limit);
  const failures: Array<{ key: string; index: number; differences?: string[]; error?: string }> = [];
  for (const { key, index, card } of selected) {
    try {
      const rebuilt = await rebuild(card);
      const value = rebuilt && typeof rebuilt === "object" ? rebuilt as Record<string, unknown> : {};
      const differences = [
        ...compareCards(value.rewriteValue, card.rewriteValue).map(path => `rewriteValue.${path}`),
        ...compareProducts(value.selectedProduct, card.selectedProduct).map(path => `selectedProduct.${path}`),
      ];
      if (differences.length) failures.push({ key, index, differences });
    } catch (error) { failures.push({ key, index, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { service, total: selected.length, ok: selected.length - failures.length, failures };
}
