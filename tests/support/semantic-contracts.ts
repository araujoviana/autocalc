import { isDeepStrictEqual } from "node:util";

export interface ControlExpectation {
  path: readonly string[];
  value: unknown;
}

export interface CardContract {
  service: string;
  region: string;
  billing: string;
  controls: readonly ControlExpectation[];
  products: readonly Readonly<Record<string, unknown>>[];
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function at(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => record(current)[key], value);
}
function equal(actual: unknown, expected: unknown): boolean {
  // The real UI may retain numeric input as text. Missing values never equal zero.
  if (typeof expected === "number" && typeof actual === "string" && actual.trim() !== "") return Number(actual) === expected;
  // Checkbox selections have no ordering. Object arrays are not treated as sets.
  if (Array.isArray(actual) && Array.isArray(expected) && [...actual, ...expected].every(v => typeof v === "string")) {
    return isDeepStrictEqual([...actual].sort(), [...expected].sort());
  }
  return isDeepStrictEqual(actual, expected);
}

/** Independent test oracle for literal, vendor-observed configuration expectations.
 * Does not call the production normalizer, form flattener, product diff, or builder
 * to derive expected values. Product multiplicity is checked with a full matching,
 * so overlapping expected subsets cannot create an order-dependent greedy match.
 * Price/publication verification is a separate gate and is not inferred here.
 */
export function semanticIssues(card: unknown, contract: CardContract): string[] {
  const selected = record(record(card).selectedProduct);
  const issues: string[] = [];
  if (String(selected.serviceCode ?? "").toLowerCase() !== contract.service.toLowerCase()) issues.push("service differs from request");
  if (selected.region !== contract.region) issues.push("region differs from request");
  if (selected.chargeModeName !== contract.billing.toUpperCase()) issues.push("billing differs from request");
  for (const { path, value } of contract.controls) {
    if (!equal(at(card, path), value)) issues.push(`control ${path.join(".")} differs from request`);
  }
  const actual = selected.productAllInfos;
  if (!Array.isArray(actual)) return [...issues, "products are missing"];
  if (actual.length !== contract.products.length) issues.push(`product count ${actual.length} differs from expected ${contract.products.length}`);
  const owner = actual.map(() => -1);
  const matches = contract.products.map(expected => actual.map((product, index) =>
    Object.entries(expected).every(([key, value]) => equal(record(product)[key], value)) ? index : -1).filter(index => index !== -1));
  function assign(expected: number, visited: Set<number>): boolean {
    for (const index of matches[expected]!) {
      if (visited.has(index)) continue;
      visited.add(index);
      if (owner[index] === -1 || assign(owner[index]!, visited)) {
        owner[index] = expected;
        return true;
      }
    }
    return false;
  }
  contract.products.forEach((_, index) => {
    if (!assign(index, new Set())) issues.push(`product ${index} configuration differs from request`);
  });
  return issues;
}

export function assertSemanticCard(card: unknown, contract: CardContract): void {
  const issues = semanticIssues(card, contract);
  if (issues.length) throw new Error(`Semantic contract ${contract.service}/${contract.region}: ${issues.join("; ")}`);
}
