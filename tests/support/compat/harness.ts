export type Product = Record<string, any>;
export type Tuple = [number | null, number | null, number | null];
export interface Diff { key: string; builder?: Tuple; page?: Tuple }

const key = (p: Product) => `${p.resourceSpecCode ?? ""}:${p.usageFactor ?? ""}`;
const n = (v: unknown): number | null => v === undefined || v === null || v === "" ? null : Number(v);
const tuple = (p: Product): Tuple => [n(p.usageValue), n(p.usageMeasureId), n(p.productNum)];

/** Products of the builder's card against the products of the card the page built. */
export function diffProducts(built: Product[], page: Product[]): Diff[] {
  const b = new Map(built.map(p => [key(p), p])), g = new Map(page.map(p => [key(p), p]));
  const out: Diff[] = [];
  for (const k of new Set([...b.keys(), ...g.keys()])) {
    const x = b.get(k), y = g.get(k);
    if (!x || !y) { out.push({ key: k, ...(x ? { builder: tuple(x) } : {}), ...(y ? { page: tuple(y) } : {}) }); continue; }
    const tx = tuple(x), ty = tuple(y);
    if (tx.some((v, i) => v !== ty[i])) out.push({ key: k, builder: tx, page: ty });
  }
  return out;
}
