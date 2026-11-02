/** Rank candidates (ADR-0005): covers, then closest, then cheapest, then newest. Only an exact top match may be auto-confirmed. */
import { compareDecimal, formatDecimal, subDecimal } from "./decimal.ts";
import type { Candidate, Requirement } from "./model.ts";

const LABELS: Record<string, string> = { vcpus: "vCPU", memory_gb: "GB" };
export interface Ranked { candidate: Candidate; covers: boolean; exact: boolean; reason: string }

/** Python's f"{v:g}". */
export function num(v: number): string {
  if (v === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(v.toPrecision(6)))));
  if (exp < -4 || exp >= 6) {
    const [mantissa, e] = v.toExponential(5).split("e") as [string, string];
    return `${mantissa.replace(/\.?0+$/, "")}e${e[0]}${e.slice(1).padStart(2, "0")}`;
  }
  return String(Number(v.toPrecision(6)));
}

const label = (k: string) => LABELS[k] ?? k;
const needs = (req: Requirement) => Object.entries(req.needs).map(([k, v]) => `${num(v)} ${label(k)}`).join("/");
const covers = (req: Requirement, c: Candidate) => Object.entries(req.needs).every(([k, v]) => k in c.has && c.has[k]! >= v);
const closeness = (req: Requirement, c: Candidate) => Object.entries(req.needs).reduce((sum, [k, v]) => sum + (v ? Math.abs((c.has[k] ?? 0) - v) / v : (c.has[k] ?? 0)), 0);
const isExact = (req: Requirement, c: Candidate, cov: boolean) =>
  !!(Object.keys(req.needs).length || req.spec) && cov && Object.entries(req.needs).every(([k, v]) => c.has[k] === v) && (req.spec === null || c.spec === req.spec);
const cmp = <T extends number | string | boolean>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);

export function rank(req: Requirement, candidates: Candidate[]): Ranked[] {
  const rows = candidates.map(c => ({ c, cov: covers(req, c) }));
  rows.sort((x, y) => cmp(!x.cov, !y.cov) || cmp(closeness(req, x.c), closeness(req, y.c))
    || cmp(!!req.spec && x.c.spec !== req.spec, !!req.spec && y.c.spec !== req.spec)
    || compareDecimal(x.c.price, y.c.price) || cmp(-x.c.generation, -y.c.generation) || cmp(x.c.spec, y.c.spec));
  const ranked: Ranked[] = rows.map(({ c, cov }) => ({ candidate: c, covers: cov, exact: isExact(req, c, cov), reason: "" }));
  const exact = ranked.filter(r => r.exact), covering = ranked.filter(r => r.covers && !r.exact);
  for (const r of ranked) r.reason = reason(req, r, exact, covering);
  return ranked;
}

function reason(req: Requirement, r: Ranked, exact: Ranked[], covering: Ranked[]): string {
  const c = r.candidate;
  if (!r.covers) {
    const miss = Object.entries(req.needs).filter(([k, v]) => !(k in c.has) || c.has[k]! < v)
      .map(([k, v]) => `${num(v)} ${label(k)} (has ${k in c.has ? num(c.has[k]!) : "not stated"})`);
    return "misses " + miss.join(", ");
  }
  const what = needs(req) || `named spec ${c.spec}`;
  if (r.exact) {
    if (exact.length === 1) return `covers ${what}; exact match`;
    if (r === exact[0]) return `covers ${what}; cheapest of ${exact.length} exact matches`;
    return `exact match; ${formatDecimal(subDecimal(c.price, exact[0]!.candidate.price))} above the cheapest exact match`;
  }
  const extra = Object.entries(req.needs).filter(([k, v]) => c.has[k]! > v).map(([k, v]) => `+${num(c.has[k]! - v)} ${label(k)}`).join(", ");
  let why = (Object.keys(req.needs).length ? `covers ${needs(req)}` : "candidate spec") + (extra ? ` with ${extra}` : "");
  if (req.spec && c.spec !== req.spec) why += `; not the named spec ${req.spec}`;
  if (r === covering[0]) why += `; closest of ${covering.length} covering`;
  return why;
}

export const autoConfirmable = (ranked: Ranked[]) => ranked.length > 0 && ranked[0]!.exact;
