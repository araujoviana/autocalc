export type Product = Record<string, any>;
export type Tuple = [number | null, number | null, number | null];
export interface Diff {
  key: string;
  field?: string;
  builder?: unknown;
  page?: unknown;
  differences?: Record<string, { builder: unknown; page: unknown }>;
}

export interface CardContext {
  region?: string;
  billing?: string;
}

const key = (p: Product) => `${p.resourceSpecCode ?? ""}:${p.usageFactor ?? ""}`;
const n = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number(v));
const s = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));
const tuple = (p: Product): Tuple => [n(p.usageValue), n(p.usageMeasureId), n(p.productNum)];

export interface SemanticDimensions {
  resourceSpecCode: string | null;
  usageFactor: string | null;
  usageValue: number | null;
  usageMeasureId: number | null;
  productNum: number | null;
  resourceSize: number | null;
  resourceSizeMeasureId: number | null;
  region: string | null;
  billingMode: string | null;
  cloudServiceType: string | null;
  resourceType: string | null;
}

function extractSemantic(p: Product, context?: CardContext): SemanticDimensions {
  return {
    resourceSpecCode: s(p.resourceSpecCode),
    usageFactor: s(p.usageFactor),
    usageValue: n(p.usageValue),
    usageMeasureId: n(p.usageMeasureId),
    productNum: n(p.productNum),
    resourceSize: n(p.resourceSize),
    resourceSizeMeasureId: n(p.resouceSizeMeasureId ?? p.resourceSizeMeasureId),
    region: s(p.regionId ?? p.region) ?? (context?.region ? s(context.region) : null),
    billingMode: s(p.billingMode ?? p.chargeMode) ?? (context?.billing ? s(context.billing) : null),
    cloudServiceType: s(p.cloudServiceType),
    resourceType: s(p.resourceType),
  };
}

function dimensionsMatch(a: SemanticDimensions, b: SemanticDimensions): boolean {
  return (
    a.resourceSpecCode === b.resourceSpecCode &&
    a.usageFactor === b.usageFactor &&
    a.usageValue === b.usageValue &&
    a.usageMeasureId === b.usageMeasureId &&
    a.productNum === b.productNum &&
    a.resourceSize === b.resourceSize &&
    a.resourceSizeMeasureId === b.resourceSizeMeasureId &&
    a.region === b.region &&
    a.billingMode === b.billingMode &&
    a.cloudServiceType === b.cloudServiceType &&
    a.resourceType === b.resourceType
  );
}

function findDifferences(a: SemanticDimensions, b: SemanticDimensions): Record<string, { builder: unknown; page: unknown }> {
  const diffs: Record<string, { builder: unknown; page: unknown }> = {};
  for (const k of Object.keys(a) as (keyof SemanticDimensions)[]) {
    if (a[k] !== b[k]) {
      diffs[k] = { builder: a[k], page: b[k] };
    }
  }
  return diffs;
}

function dimensionDistance(a: SemanticDimensions, b: SemanticDimensions): number {
  let dist = 0;
  if (a.resourceSpecCode !== b.resourceSpecCode) dist += 10;
  if (a.usageFactor !== b.usageFactor) dist += 10;
  if (a.region !== b.region) dist += 5;
  if (a.billingMode !== b.billingMode) dist += 5;
  if (a.resourceSize !== b.resourceSize) dist += 2;
  if (a.resourceSizeMeasureId !== b.resourceSizeMeasureId) dist += 2;
  if (a.productNum !== b.productNum) dist += 2;
  if (a.usageValue !== b.usageValue) dist += 1;
  if (a.usageMeasureId !== b.usageMeasureId) dist += 1;
  if (a.cloudServiceType !== b.cloudServiceType) dist += 1;
  if (a.resourceType !== b.resourceType) dist += 1;
  return dist;
}

/** Products of the builder's card against the products of the card the page built,
 * evaluated as a strict semantic multiset preserving multiplicity, capacity, region,
 * billing mode, and service/resource classifications. Deterministic across input order. */
export function diffProducts(built: Product[], page: Product[], context?: CardContext): Diff[] {
  const bList = built.map((p, idx) => ({ raw: p, sem: extractSemantic(p, context), used: false, originalIndex: idx }));
  const pList = page.map((p, idx) => ({ raw: p, sem: extractSemantic(p, context), used: false, originalIndex: idx }));

  // 1. Match exact semantic duplicates strictly (order-independent equivalence)
  for (const b of bList) {
    const match = pList.find(p => !p.used && dimensionsMatch(b.sem, p.sem));
    if (match) {
      b.used = true;
      match.used = true;
    }
  }

  const out: Diff[] = [];

  // 2. Deterministic pairing of remaining items by key and minimum dimensional distance
  const remainingB = bList.filter(item => !item.used);
  for (const b of remainingB) {
    const candidates = pList.filter(p => !p.used && key(b.raw) === key(p.raw));
    if (candidates.length > 0) {
      // Pick best matching candidate deterministically
      candidates.sort((c1, c2) => {
        const d1 = dimensionDistance(b.sem, c1.sem);
        const d2 = dimensionDistance(b.sem, c2.sem);
        if (d1 !== d2) return d1 - d2;
        return c1.originalIndex - c2.originalIndex;
      });
      const candidate = candidates[0]!;
      b.used = true;
      candidate.used = true;
      const tx = tuple(b.raw), ty = tuple(candidate.raw);
      const diffs = findDifferences(b.sem, candidate.sem);
      if (tx.some((v, i) => v !== ty[i])) {
        out.push({ key: key(b.raw), builder: tx, page: ty, differences: diffs });
      } else {
        out.push({ key: key(b.raw), builder: b.sem, page: candidate.sem, differences: diffs });
      }
    }
  }

  // 3. Report remaining unmatched builder lines (missing on page)
  for (const b of bList.filter(item => !item.used)) {
    out.push({ key: key(b.raw), builder: tuple(b.raw) });
  }

  // 4. Report remaining unmatched page lines (missing on builder)
  for (const p of pList.filter(item => !item.used)) {
    out.push({ key: key(p.raw), page: tuple(p.raw) });
  }

  return out;
}
