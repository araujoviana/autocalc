import { CalculatorError } from "./errors.ts";

const aliases: Record<string, string> = {
  santiago: "la-south-2", chile: "la-south-2", "la-south-2": "la-south-2",
  "sao paulo": "sa-brazil-1", "sao paulo1": "sa-brazil-1", brazil: "sa-brazil-1", brasil: "sa-brazil-1", "la-sao paulo1": "sa-brazil-1",
  lima: "sa-peru-1", peru: "sa-peru-1", "buenos aires": "sa-argentina-1", argentina: "sa-argentina-1",
  "mexico city2": "la-north-2", "mexico city 2": "la-north-2", "la-north-2": "la-north-2",
  "mexico city1": "na-mexico-1", "mexico city 1": "na-mexico-1", "na-mexico-1": "na-mexico-1",
  johannesburg: "af-south-1", "south africa": "af-south-1", "af-south-1": "af-south-1",
  singapore: "ap-southeast-3", "hong kong": "ap-southeast-1", "cn-hong kong": "ap-southeast-1",
  bangkok: "ap-southeast-2", jakarta: "ap-southeast-4", manila: "ap-southeast-5",
  istanbul: "tr-west-1", cairo: "af-north-1", moscow: "ru-moscow-1", "kuala lumpur": "my-kualalumpur-1",
  dublin: "eu-west-0", amsterdam: "eu-west-0", paris: "eu-west-0",
};
const ambiguous: Record<string, string[]> = { mexico: ["na-mexico-1", "la-north-2"], eu: ["eu-west-0", "eu-west-101"], europe: ["eu-west-0", "eu-west-101"] };
const normalize = (value: string): string => value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
export class RegionResolver {
  constructor(private readonly names: Record<string, string> = {}) {}
  candidates(query: string): string[] {
    const q = normalize(query);
    if (!q) return [];
    const index = new Map<string, Set<string>>();
    const add = (key: string, id: string) => { const normalized = normalize(key); if (!normalized) return; const values = index.get(normalized) ?? new Set<string>(); values.add(id); index.set(normalized, values); };
    for (const [id, name] of Object.entries(this.names)) { add(id, id); add(name, id); }
    for (const [alias, id] of Object.entries(aliases)) add(alias, id);
    const exact = index.get(q);
    if (exact) return [...exact].sort();
    if (ambiguous[q]) return [...ambiguous[q]];
    const matches = new Set<string>();
    for (const [key, values] of index) if (key.includes(q) || q.includes(key)) for (const id of values) matches.add(id);
    return [...matches].sort();
  }
  resolve(query: string): string {
    const candidates = this.candidates(query);
    if (!candidates.length) throw new CalculatorError("REGION_NOT_FOUND", `Unknown region ${query}.`, "Use a region ID or city name.", { query });
    if (candidates.length > 1) {
      const exact = candidates.find(id => normalize(id) === normalize(query));
      if (exact) return exact;
      throw new CalculatorError("REGION_AMBIGUOUS", `Ambiguous region ${query}.`, "Choose a region ID.", { query, candidates });
    }
    return candidates[0]!;
  }
  display(id: string): string { return this.names[id] ?? id; }
}
