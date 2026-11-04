/** Terminal views for the read-only commands (lists, validate, edit-check, doctor, search, quote). Null means "print JSON". */

import { paint, status, table, type StreamLike } from "./ui.ts";

type Row = Record<string, any>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
/** Two decimals, except that a sub-dollar amount (an hourly price) keeps up to four, so 0.0274 does not read as 0.03. */
const money = (v: unknown): string => typeof v === "number" ? (v !== 0 && Math.abs(v) < 1 ? String(Number(v.toFixed(4))) : v.toFixed(2)) : v == null || v === "" ? "-" : String(v);
const clip = (text: string, max: number): string => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const date = (ms: unknown): string => typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "-";

function lists(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow).sort((a, b) => Number(b.updated ?? 0) - Number(a.updated ?? 0));
  if (!items.length) return "No saved lists on this account.";
  const body = items.map(r => [clip(String(r.name ?? "(unnamed)"), 44), money(isRow(r.total) ? r.total.amount : r.total), date(r.updated), String(r.id ?? "")]);
  return `${table(body, ["NAME", "TOTAL USD", "UPDATED", "ID"], s)}\n${paint(`${items.length} lists, newest first. Open one: autocalc read <id>; re-check its prices: autocalc edit-check <id>.`, "dim", s)}`;
}

function validate(r: Row, s?: StreamLike): string {
  const issues: unknown[] = Array.isArray(r.issues) ? r.issues : [];
  const head = `${r.items ?? "?"} item${r.items === 1 ? "" : "s"}, total ${money(r.total)}`;
  return [status(r.ok ? "ok" : "fail", r.ok && !issues.length ? `${head}; no issues` : head, s), ...issues.map(i => `  ${String(i)}`)].join("\n");
}

function editCheck(r: Row, s?: StreamLike): string {
  const results: Row[] = Array.isArray(r.results) ? r.results.filter(isRow) : [];
  const body = results.map(c => [String(c.title ?? c.index), String(c.status ?? "-"), money(c.stored), money(c.edit), money(c.delta), clip(String(c.reason ?? ""), 60)]);
  const warnings = results.flatMap(c => (Array.isArray(c.warnings) ? c.warnings : []).map(w => `${String(c.title ?? c.index)}: ${String(w)}`));
  const bad = results.filter(c => c.status !== "ok").length;
  return [table(body, ["CARD", "STATUS", "STORED", "EDIT", "DELTA", "REASON"], s),
    status(r.ok ? "ok" : "fail", r.ok ? `${results.length} card${results.length === 1 ? "" : "s"} re-price to the stored amount` : `${bad} of ${results.length} cards differ`, s),
    ...warnings.map(w => status("warn", w, s))].join("\n");
}

function doctor(r: Row, s?: StreamLike): string {
  const checks: Row[] = Array.isArray(r.checks) ? r.checks.filter(isRow) : [];
  const auth = isRow(r.auth) ? r.auth : null;
  const lines = checks.map(c => status(c.ok ? "ok" : "fail", `${String(c.name)} endpoint`, s));
  if (auth) {
    const age = typeof auth.age_hours === "number" ? `, session ${auth.age_hours.toFixed(1)} h old` : "";
    lines.push(auth.logged_in ? status("ok", `signed in (profile ${String(auth.profile)}${age})`, s) : status("warn", `not signed in (profile ${String(auth.profile)}): run autocalc login`, s));
  }
  return lines.join("\n");
}

function search(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow);
  if (!items.length) return "No SKUs match.";
  const modes = (["ondemand", "monthly", "yearly"] as const).filter(m => items.some(r => r[m] != null));
  const size = (d: unknown) => { const t = String(d ?? ""), v = /vCPUs:\s*(\d+)/.exec(t), m = /Memory:\s*(\d+)MB/.exec(t); return v && m ? `${v[1]} vCPU, ${Number(m[1]) / 1024} GB` : clip(t, 48); };
  return `${table(items.map(r => [String(r.spec), ...modes.map(m => money(r[m])), size(r.description)]), ["SPEC", ...modes.map(m => m.toUpperCase()), "SIZE"], s)}\n${paint("List prices in USD.", "dim", s)}`;
}

function quote(r: Row, s?: StreamLike): string {
  const items: Row[] = Array.isArray(r.items) ? r.items.filter(isRow) : [];
  const head = paint([r.region, r.billing, r.term].filter(Boolean).join(" · "), "bold", s);
  const body = items.map(i => [String(i.service), String(i.spec), String(i.quantity ?? 1), i.size == null ? "-" : String(i.size), money(i.amount)]);
  const total = `TOTAL ${money(r.total)} ${String(r.currency ?? "USD")}` + (Number(r.discount) > 0 ? `  (discount ${money(r.discount)}, list price ${money(r.list_price)})` : "");
  const conv = isRow(r.converted) && r.converted.total != null ? `\n= ${money(r.converted.total)} ${String(r.converted.currency)} at ${String(r.converted.rate)}` : "";
  return `${head}\n${table(body, ["SERVICE", "SPEC", "QTY", "SIZE", "AMOUNT"], s)}\n${paint(total, "bold", s)}${conv}`;
}

export function humanView(cmd: string, result: unknown, s?: StreamLike): string | null {
  if (Array.isArray(result)) return cmd === "lists" ? lists(result, s) : cmd === "search" ? search(result, s) : null;
  if (!isRow(result)) return null;
  if (cmd === "validate" && "items" in result) return validate(result, s);
  if (cmd === "edit-check" && Array.isArray(result.results)) return editCheck(result, s);
  if (cmd === "doctor" && Array.isArray(result.checks)) return doctor(result, s);
  if (cmd === "quote" && Array.isArray(result.items)) return quote(result, s);
  return null;
}
