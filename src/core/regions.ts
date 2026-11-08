import { CalculatorError } from "./errors.ts";

export const PRIMARY_REGIONS = ["sa-brazil-1", "la-south-2", "ap-southeast-3"] as const;

export interface RegionInfo {
  /** Technical Region ID / code (e.g. `sa-brazil-1`) */
  id: string;
  /** Human geographic location (e.g. `São Paulo, Brazil`) */
  location: string;
  /** Official Huawei Cloud portal label (e.g. `LA-Sao Paulo1`) */
  portalName: string;
}

/** Curated geographic locations for known Huawei Cloud regions. */
export const REGION_LOCATIONS: Record<string, string> = {
  "sa-brazil-1": "São Paulo, Brazil",
  "la-south-2": "Santiago, Chile",
  "la-north-2": "Mexico City 2, Mexico",
  "na-mexico-1": "Mexico City 1, Mexico",
  "sa-peru-1": "Lima, Peru",
  "sa-argentina-1": "Buenos Aires, Argentina",
  "ap-southeast-1": "Hong Kong, China",
  "ap-southeast-2": "Bangkok, Thailand",
  "ap-southeast-3": "Singapore",
  "ap-southeast-4": "Jakarta, Indonesia",
  "ap-southeast-5": "Manila, Philippines",
  "my-kualalumpur-1": "Kuala Lumpur, Malaysia",
  "af-south-1": "Johannesburg, South Africa",
  "af-north-1": "Cairo, Egypt",
  "tr-west-1": "Istanbul, Turkey",
  "tr-central-201": "Turkey Central",
  "me-east-1": "Riyadh, Saudi Arabia",
  "eu-west-0": "Paris / Dublin (EU West 0)",
  "eu-west-101": "Dublin, Ireland (EU West 101)",
  "ru-moscow-1": "Moscow, Russia",
  "cn-north-1": "Beijing 1, China",
  "cn-north-4": "Beijing 4, China",
  "cn-north-9": "Ulanqab 1, China",
  "cn-north-12": "China North 3",
  "cn-east-2": "Shanghai 2, China",
  "cn-east-3": "Shanghai 1, China",
  "cn-east-4": "China East 2",
  "cn-east-5": "Qingdao, China",
  "cn-south-1": "Guangzhou, China",
  "cn-southwest-2": "Guiyang 1, China",
};

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
  riyadh: "me-east-1", "saudi arabia": "me-east-1", "me-east-1": "me-east-1",
  beijing: "cn-north-4", "beijing 1": "cn-north-1", "beijing 4": "cn-north-4",
  shanghai: "cn-east-3", "shanghai 1": "cn-east-3", "shanghai 2": "cn-east-2",
  guangzhou: "cn-south-1", qingdao: "cn-east-5", guiyang: "cn-southwest-2", ulanqab: "cn-north-9",
  dublin: "eu-west-0", amsterdam: "eu-west-0", paris: "eu-west-0",
};
const ambiguous: Record<string, string[]> = { mexico: ["na-mexico-1", "la-north-2"], eu: ["eu-west-0", "eu-west-101"], europe: ["eu-west-0", "eu-west-101"] };
const normalize = (value: string): string => value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Returns the human geographic location for a region ID (e.g. `sa-brazil-1` -> `São Paulo, Brazil`). */
export function regionLocation(id: string, portalName?: string): string {
  return REGION_LOCATIONS[id] ?? (portalName && portalName !== id ? portalName : id);
}

/** Formats both the technical region ID and the geographic location (e.g. `sa-brazil-1 (São Paulo, Brazil)`). */
export function formatRegion(id: string, portalName?: string): string {
  const loc = REGION_LOCATIONS[id];
  if (loc) return `${id} (${loc})`;
  if (portalName && portalName !== id) return `${id} (${portalName})`;
  return id;
}

export class RegionResolver {
  constructor(private readonly names: Record<string, string> = {}) {}
  candidates(query: string): string[] {
    const q = normalize(query);
    if (!q) return [];
    const index = new Map<string, Set<string>>();
    const add = (key: string, id: string) => { const normalized = normalize(key); if (!normalized) return; const values = index.get(normalized) ?? new Set<string>(); values.add(id); index.set(normalized, values); };
    for (const [id, name] of Object.entries(this.names)) { add(id, id); add(name, id); }
    for (const [id, loc] of Object.entries(REGION_LOCATIONS)) add(loc, id);
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
    if (!candidates.length) throw new CalculatorError("REGION_NOT_FOUND", `Unknown region ${query}.`, "Use a region ID (e.g. sa-brazil-1) or location name (e.g. \"São Paulo\", \"Santiago\").", { query });
    if (candidates.length > 1) {
      const exact = candidates.find(id => normalize(id) === normalize(query));
      if (exact) return exact;
      throw new CalculatorError("REGION_AMBIGUOUS", `Ambiguous region ${query}.`, "Choose a specific region ID.", { query, candidates });
    }
    return candidates[0]!;
  }
  display(id: string): string { return this.names[id] ?? id; }
  location(id: string): string { return regionLocation(id, this.names[id]); }
  info(id: string): RegionInfo {
    const portalName = this.names[id] ?? id;
    return { id, location: regionLocation(id, portalName), portalName };
  }
}
