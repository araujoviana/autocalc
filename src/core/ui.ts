/** Terminal rendering for the commands people read. Plain text unless the stream is a terminal (`src/autocalc/ui.py`). */

import type { CalculatorError } from "./errors.ts";

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
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, any>;
  if (cmd === "plan-quote" && Array.isArray(r.cards)) {
    const rows: Array<[string, string, string, string]> = [];
    for (const c of r.cards) {
      const notes: string[] = [];
      if (Array.isArray(c.unmapped_options) && c.unmapped_options.length) {
        notes.push("unmapped: " + c.unmapped_options.join(", "));
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
      (c: any) => !("spec" in c) || (Array.isArray(c.unmapped_options) && c.unmapped_options.length) || c.lock_drift,
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
    const checks = Array.isArray(r.checks) ? r.checks : [];
    return `${status("ok", `Published ${r.name ?? ""}  ${checks.length} cards verified`, stream)}\n  ${r.url}`;
  }
  return null;
}

export function formatError(exc: CalculatorError, stream?: StreamLike): string {
  const s = stream ?? process.stderr;
  let out = `${paint("error", "red", s)}[${exc.code}]: ${exc.message}\n`;
  if (exc.hint) {
    out += `  ${paint("->", "dim", s)} ${exc.hint}\n`;
  }
  if (exc.details) {
    out += `  ${JSON.stringify(exc.details)}\n`;
  }
  return out;
}
