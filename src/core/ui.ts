/** Terminal rendering for the commands people read. Plain text unless the stream is a terminal (`src/autocalc/ui.py`). */

import type { CalculatorError } from "./errors.ts";
import { humanView } from "./views.ts";

export interface StreamLike {
  isTTY?: boolean | undefined;
  isatty?: (() => boolean) | undefined;
  encoding?: string | undefined;
}

const COLORS: Record<string, string> = {
  green: "32",
  yellow: "33",
  red: "31",
  dim: "2",
  bold: "1",
};

const GLYPHS: Record<"ok" | "warn" | "fail", [string, string, string]> = {
  ok: ["✓", "green", "[ok]  "],
  warn: ["⚠", "yellow", "[warn]"],
  fail: ["✗", "red", "[FAIL]"],
};

let defaultStreamOverride: StreamLike | null = null;

export function setDefaultStream(stream: StreamLike | null): void {
  defaultStreamOverride = stream;
}

function resolveStream(stream?: StreamLike): StreamLike {
  return stream ?? defaultStreamOverride ?? process.stdout;
}

/** True when `stream` is a terminal that should get colors and glyphs. */
export function fancy(stream?: StreamLike): boolean {
  const s = resolveStream(stream);
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  if (typeof s.isatty === "function") return Boolean(s.isatty());
  return Boolean(s.isTTY);
}

export function paint(text: string, color: "green" | "yellow" | "red" | "dim" | "bold", stream?: StreamLike): string {
  return fancy(stream) ? `\x1b[${COLORS[color]}m${text}\x1b[0m` : text;
}

const NON_UNICODE_ENCODINGS = new Set([
  "ascii",
  "us-ascii",
  "cp1252",
  "windows-1252",
  "latin1",
  "iso-8859-1",
  "cp437",
  "cp850",
]);

function canPrint(text: string, stream?: StreamLike): boolean {
  const s = resolveStream(stream);
  const enc = (s.encoding ?? "utf-8").toLowerCase();
  if (NON_UNICODE_ENCODINGS.has(enc)) {
    return [...text].every(ch => ch.charCodeAt(0) <= 0x7f);
  }
  return true;
}

/** One check line: `✓ text` on a terminal (`[ok] text` when the encoding lacks the glyph), plain otherwise. */
export function status(kind: "ok" | "warn" | "fail", text: string, stream?: StreamLike): string {
  const [glyph, color, plain] = GLYPHS[kind];
  if (!fancy(stream)) return `${plain} ${text}`;
  const mark = canPrint(glyph, stream) ? glyph : plain.trim();
  return `${paint(mark, color as "green" | "yellow" | "red", stream)} ${text}`;
}

/** Left-aligned columns, two spaces apart; the last column is not padded. */
export function table(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  headers?: ReadonlyArray<string>,
  stream?: StreamLike,
): string {
  const grid = [...(headers ? [headers] : []), ...rows].map(r => r.map(c => String(c)));
  if (!grid.length || !grid[0]?.length) return "";
  const cols = grid[0].length;
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...grid.map(r => (r[i] ?? "").length)));
  const lines = grid.map(r =>
    r.map((c, i) => (i < r.length - 1 ? c.padEnd(widths[i]!) : c)).join("  "),
  );
  if (headers && fancy(stream)) {
    lines[0] = paint(lines[0]!, "bold", stream);
  }
  return lines.join("\n");
}

/** A terminal summary of plan-quote / apply-quote; null for every other tool (they print JSON). */
export function quoteView(cmd: string, result: unknown, stream?: StreamLike): string | null {
  const read = humanView(cmd, result, stream);
  if (read !== null) return read;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, any>;
  if (cmd === "plan-quote" && Array.isArray(r.cards)) {
    const rows: Array<[string, string, string, string]> = [];
    for (const c of r.cards) {
      const notes: string[] = [];
      if (Array.isArray(c.unmapped_options) && c.unmapped_options.length) {
        notes.push("unmapped: " + c.unmapped_options.join(", "));
      }
      if (Array.isArray(c.image_choices) && c.image_choices.length) {
        notes.push(`image is ambiguous (${c.image_choices.length} match): set options.image`);
      }
      if (c.lock_drift) {
        notes.push(`price moved from ${c.lock_drift.locked_price}`);
      }
      if ("candidates" in c && Array.isArray(c.candidates)) {
        notes.push(`${c.candidates.length} candidates: choose a spec`);
      }
      rows.push([String(c.id), String(c.spec ?? "-"), String(c.price || "-"), notes.join("; ")]);
    }
    const problems = r.cards.filter(
      (c: any) => !("spec" in c) || (Array.isArray(c.unmapped_options) && c.unmapped_options.length) || c.lock_drift || (Array.isArray(c.image_choices) && c.image_choices.length),
    ).length;
    const out = table(rows, ["CARD", "SPEC", "PRICE", "NOTES"], stream);
    return (
      out +
      "\n" +
      (problems
        ? status("warn", `${problems} of ${rows.length} cards need attention before apply`, stream)
        : status("ok", `${rows.length} cards resolved; ready to apply`, stream))
    );
  }
  if (cmd === "apply-quote" && r.url) {
    const checks: any[] = Array.isArray(r.checks) ? r.checks : [];
    const rows = checks.map((c): [string, string, string, string, string] => [String(c.title ?? c.index), String(c.stored ?? "-"), String(c.rated ?? "-"), String(c.edit ?? "-"), c.ok === false ? "differs" : "ok"]);
    const warnings: string[] = Array.isArray(r.warnings) ? r.warnings.map(String) : [];
    return [
      rows.length ? table(rows, ["CARD", "STORED", "RATED", "EDIT", "CHECK"], stream) : null,
      status("ok", `Published ${r.name ?? "the list"}: ${checks.length} card${checks.length === 1 ? "" : "s"} verified`, stream),
      ...warnings.map(w => status("warn", w, stream)),
      `  ${r.url}`,
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

export function formatError(exc: CalculatorError, stream?: StreamLike): string {
  const s = stream ?? process.stderr;
  let out = `${paint("error", "red", s)}[${exc.code}]: ${exc.message}\n`;
  const details = exc.details;
  if (exc.code === "GATE_FAILED" && details) out += gateLines(details, s);
  else if (details) {
    for (const [key, value] of Object.entries(details)) out += `  ${paint(`${key}:`, "dim", s)} ${typeof value === "string" ? value : JSON.stringify(value)}\n`;
  }
  const hint = exc.hint ?? (exc.code === "GATE_FAILED" ? GATE_HINT : undefined);
  if (hint) out += `  ${paint("->", "dim", s)} ${hint}\n`;
  return out;
}
