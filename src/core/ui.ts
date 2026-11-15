/** Terminal rendering for the commands people read. Plain text unless the stream is a terminal (`src/autocalc/ui.py`). */

import type { CalculatorError } from "./errors.ts";
import { formatRegion } from "./regions.ts";
import { humanView } from "./views.ts";
import {
  fancy,
  isTerminal,
  kv,
  paint,
  setDefaultStream,
  status,
  table,
  visibleWidth,
  type ColorName,
  type StreamLike,
} from "./ui-primitives.ts";

export {
  fancy,
  isTerminal,
  kv,
  paint,
  setDefaultStream,
  status,
  table,
  visibleWidth,
  type ColorName,
  type StreamLike,
};

/** A terminal summary for any CLI command; falls back to humanView and universal key-value/table rendering. */
const PRICE_UNIT: Record<string, string> = { hour: "/h", month: "/mo", year: "/yr", request: "/request" };
export function quoteView(cmd: string, result: unknown, stream?: StreamLike): string | null {
  const read = humanView(cmd, result, stream);
  if (read !== null) return read;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, any>;
  if ((cmd === "plan-quote" || cmd === "plan") && Array.isArray(r.cards)) {
    const rows: Array<[string, string, string, string]> = [];
    for (const c of r.cards) {
      const notes: string[] = [];
      if (Array.isArray(c.unmapped_options) && c.unmapped_options.length) {
        notes.push("unmapped: " + c.unmapped_options.join(", "));
      }
      if (Array.isArray(c.image_choices) && c.image_choices.length) {
        notes.push(`image is ambiguous (${c.image_choices.length} match): set options.image`);
      }
      if (c.price_anomaly) notes.push("yearly price looks wrong: " + String(c.price_anomaly).replace(/^Catalog anomaly: /, ""));
      if (c.spec_problem) notes.push(String(c.spec_problem));
      if (c.lock_drift) {
        notes.push(`price moved from ${c.lock_drift.locked_price}`);
      }
      if ("candidates" in c && Array.isArray(c.candidates)) {
        notes.push(c.spec_not_found ? `spec ${c.spec_not_found} not sold here; ${c.candidates.length} closest: choose a spec` : `${c.candidates.length} candidates: choose a spec`);
      }
      if (c.billing_note) notes.push(String(c.billing_note));
      if (c.note) notes.push(String(c.note));
      if (c.price_note && !notes.length) {
        notes.push("usage-priced at publish time");
      }
      rows.push([String(c.id), String(c.spec ?? "-"), c.price ? `${c.price}${PRICE_UNIT[String(c.price_unit)] ?? ""}` : "-", notes.join("; ")]);
    }
    const problems = r.cards.filter(
      (c: any) => !("spec" in c) || c.spec_problem || (Array.isArray(c.unmapped_options) && c.unmapped_options.length) || c.lock_drift || c.price_anomaly || (Array.isArray(c.image_choices) && c.image_choices.length),
    ).length;
    const out = table(rows, ["CARD", "SPEC", "PRICE", "NOTES"], stream);

    let shardSection = "";
    if (Array.isArray(r.shards) && r.shards.length > 1) {
      const shardRows = r.shards.map((s: any) => [
        String(s.title ?? `Part ${s.index + 1}`),
        `${s.cardCount ?? s.card_count} cards`,
        `~${Math.round((s.estimatedBytes ?? s.estimated_bytes ?? 0) / 1024)} KiB`,
      ]);
      shardSection = "\n\n" +
        paint("Partition Shards (>200 cards or >950 KiB):", "bold", stream) + "\n" +
        table(shardRows, ["SHARD", "CARDS", "WIRE SIZE"], stream);
    }

    return (
      out +
      shardSection +
      "\n" +
      (problems
        ? status("warn", `${problems} of ${rows.length} cards need attention before apply`, stream)
        : status("ok", `${rows.length} cards resolved${Array.isArray(r.shards) && r.shards.length > 1 ? ` across ${r.shards.length} shards` : ""}; ready to apply`, stream))
    );
  }
  if ((cmd === "apply-quote" || cmd === "apply" || cmd === "publish-quote" || cmd === "publish_quote") && r.url) {
    const checks: any[] = Array.isArray(r.checks) ? r.checks : [];
    const rows = checks.map((c): [string, string, string, string, string] => [String(c.title ?? c.index), String(c.stored ?? "-"), String(c.rated ?? "-"), String(c.edit ?? "-"), c.ok === false ? "differs" : "ok"]);
    const warnings: string[] = Array.isArray(r.warnings) ? r.warnings.map(String) : [];

    let shardLines: string[] = [];
    if (Array.isArray(r.shards) && r.shards.length > 1) {
      shardLines = r.shards.map((s: any) => `  ${paint(s.title || `Part ${s.index + 1}`, "bold", stream)}: ${s.url}`);
    } else {
      shardLines = [`  ${r.url}`];
    }

    return [
      rows.length ? table(rows, ["CARD", "STORED", "RATED", "EDIT", "CHECK"], stream) : null,
      status("ok", `Published ${r.name ?? "the list"}: ${checks.length} card${checks.length === 1 ? "" : "s"} verified${Array.isArray(r.shards) && r.shards.length > 1 ? ` across ${r.shards.length} lists` : ""}`, stream),
      ...warnings.map(w => status("warn", w, stream)),
      ...shardLines,
    ].filter((line): line is string => line !== null).join("\n");
  }
  return null;
}

const GATE_HINT = "The saved list is checked three ways (stored, rated, Edit view). Re-run; a page that did not load is usually transient. AUTOCALC_PAGE_HEADED=1 shows the browser.";

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);

/** One line per card of a failed publish gate, then the problems under it. */
function gateLines(details: Row, s: StreamLike): string {
  const rows = Array.isArray(details.cards) ? details.cards.filter(isRow) : [];
  let out = "";
  for (const row of rows) {
    if (typeof row.issue === "string") { out += `  ${status("fail", row.issue, s)}\n`; continue; }
    const price = (label: string, v: unknown) => `${label} ${v == null ? "not checked" : String(v)}`;
    const line = `${String(row.title ?? `card ${String(row.index ?? "?")}`)}  ${price("stored", row.stored)} · ${price("rated", row.rated)} · ${price("Edit", row.edit)}`;
    out += `  ${status(row.ok === true ? "ok" : "fail", line, s)}\n`;
    for (const problem of Array.isArray(row.problems) ? row.problems : []) out += `      ${String(problem)}\n`;
  }
  const kept = typeof details.list_id === "string" ? details.list_id : null;
  out += kept ? `  ${paint(`List ${kept} is still saved on your account.`, "yellow", s)}\n` : `  ${paint("Nothing was left saved on your account.", "dim", s)}\n`;
  return out;
}

function formatDetailLines(key: string, value: unknown, s: StreamLike): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`  ${paint(`${key}:`, "dim", s)} ${String(value)}`];
  }
  if (key === "issues" && Array.isArray(value)) {
    return value.filter(isRow).map(issue => {
      const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "input";
      const msg = String(issue.message ?? issue.code ?? "invalid value");
      return `  ${paint("•", "red", s)} ${paint(path, "bold", s)}: ${msg}`;
    });
  }
  if (key === "candidates" && Array.isArray(value)) {
    return [
      `  ${paint("candidates:", "dim", s)}`,
      ...value.map(c => `    • ${formatRegion(String(c))}`),
    ];
  }
  if (key === "allowed" && Array.isArray(value)) {
    return [`  ${paint("allowed:", "dim", s)} ${value.map(String).join(", ")}`];
  }
  if (key === "errors" && Array.isArray(value)) {
    return value.filter(isRow).map(err => {
      const cardLabel = err.card ? `card '${String(err.card)}'` : "quote";
      const fieldLabel = err.field ? ` (${String(err.field)})` : "";
      return `  ${paint("•", "red", s)} ${cardLabel}${fieldLabel}: ${String(err.error ?? "")}`;
    });
  }
  if (Array.isArray(value)) {
    return [`  ${paint(`${key}:`, "dim", s)} ${value.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(", ")}`];
  }
  if (isRow(value)) {
    const pairs = Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");
    return [`  ${paint(`${key}:`, "dim", s)} ${pairs}`];
  }
  return [];
}

export function formatError(exc: CalculatorError, stream?: StreamLike): string {
  const s = stream ?? process.stderr;
  let out = `${paint("error", "red", s)}[${exc.code}]: ${exc.message}\n`;
  const details = exc.details;
  if (exc.code === "GATE_FAILED" && details) out += gateLines(details, s);
  else if (details) {
    for (const [key, value] of Object.entries(details)) {
      if (value === undefined || value === null) continue;
      for (const line of formatDetailLines(key, value, s)) out += `${line}\n`;
    }
  }
  const hint = exc.hint ?? (exc.code === "GATE_FAILED" ? GATE_HINT : undefined);
  if (hint) out += `  ${paint("->", "dim", s)} ${hint}\n`;
  return out;
}
