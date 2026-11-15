/** Shared terminal formatting primitives (`stream`, ANSI colors, tables, key-value alignment). */
import pc from "picocolors";

export interface StreamLike {
  isTTY?: boolean | undefined;
  isatty?: (() => boolean) | undefined;
  encoding?: string | undefined;
}

export type ColorName = "green" | "yellow" | "red" | "cyan" | "blue" | "magenta" | "dim" | "bold";

const COLORS: Record<ColorName, string> = {
  green: "32",
  yellow: "33",
  red: "31",
  cyan: "36",
  blue: "34",
  magenta: "35",
  dim: "2",
  bold: "1",
};

const GLYPHS: Record<"ok" | "warn" | "fail", [string, ColorName, string]> = {
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

/** True when `stream` is an interactive terminal (independent of color settings). */
export function isTerminal(stream?: StreamLike): boolean {
  const s = resolveStream(stream);
  if (typeof s.isatty === "function") return Boolean(s.isatty());
  return Boolean(s.isTTY);
}

/** True when `stream` is a terminal that should get colors and glyphs. */
export function fancy(stream?: StreamLike): boolean {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  return isTerminal(stream);
}

export function paint(text: string, color: ColorName, stream?: StreamLike): string {
  if (!fancy(stream)) return text;
  const code = COLORS[color] ?? (pc.isColorSupported ? "1" : "");
  return code ? `\x1b[${code}m${text}\x1b[0m` : text;
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

/** Visible display width of a string (strips ANSI codes and handles Unicode widths via Bun.stringWidth). */
export function visibleWidth(text: string): number {
  return typeof Bun !== "undefined" && typeof Bun.stringWidth === "function"
    ? Bun.stringWidth(text)
    : text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** One check line: `✓ text` on a terminal (`[ok] text` when the encoding lacks the glyph), plain otherwise. */
export function status(kind: "ok" | "warn" | "fail", text: string, stream?: StreamLike): string {
  const [glyph, color, plain] = GLYPHS[kind];
  if (!fancy(stream)) return `${plain} ${text}`;
  const mark = canPrint(glyph, stream) ? glyph : plain.trim();
  return `${paint(mark, color, stream)} ${text}`;
}

/** Left-aligned columns, two spaces apart; the last column is not padded. ANSI-aware width calculation. */
export function table(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  headers?: ReadonlyArray<string>,
  stream?: StreamLike,
): string {
  const grid = [...(headers ? [headers] : []), ...rows].map(r => r.map(c => String(c)));
  if (!grid.length || !grid[0]?.length) return "";
  const cols = grid[0].length;
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...grid.map(r => visibleWidth(r[i] ?? ""))));
  const lines = grid.map(r =>
    r.map((c, i) => (i < r.length - 1 ? c + " ".repeat(Math.max(0, widths[i]! - visibleWidth(c))) : c)).join("  "),
  );
  if (headers && fancy(stream)) {
    lines[0] = paint(lines[0]!, "bold", stream);
  }
  return lines.join("\n");
}

/** Aligned key-value pairs for summary sections. */
export function kv(pairs: ReadonlyArray< readonly [string, unknown] >, stream?: StreamLike): string {
  const active = pairs.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!active.length) return "";
  const width = Math.max(...active.map(([k]) => visibleWidth(k)));
  return active
    .map(([k, v]) => `  ${paint(k.padEnd(width), "dim", stream)}  ${String(v)}`)
    .join("\n");
}
