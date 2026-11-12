/** Terminal rendering: plain for pipes and NO_COLOR, glyphs with an ASCII fallback, aligned tables, and CLI reference contract (`tests/test_ui.py`). */

import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cli from "../../src/cli.ts";
import { CalculatorError } from "../../src/core/errors.ts";
import * as ui from "../../src/core/ui.ts";

class Tty implements ui.StreamLike {
  readonly encoding: string;
  private readonly tty: boolean;
  private buf = "";

  constructor(encoding = "utf-8", tty = true) {
    this.encoding = encoding;
    this.tty = tty;
  }

  isatty(): boolean {
    return this.tty;
  }

  write(s: string): void {
    this.buf += s;
  }

  getvalue(): string {
    return this.buf;
  }

  clear(): void {
    this.buf = "";
  }
}

const savedNoColor = process.env.NO_COLOR;
const savedTerm = process.env.TERM;

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = savedNoColor;
  if (savedTerm === undefined) delete process.env.TERM;
  else process.env.TERM = savedTerm;
  for (const key of Object.keys(cli.toolOverrides)) delete cli.toolOverrides[key];
  ui.setDefaultStream(null);
});

test("no_color_when_not_a_tty_or_no_color_is_set", () => {
  delete process.env.NO_COLOR;
  process.env.TERM = "xterm";
  expect(ui.fancy(new Tty("utf-8", false))).toBe(false);
  expect(ui.paint("x", "red", new Tty("utf-8", false))).toBe("x");
  expect(ui.fancy(new Tty())).toBe(true);
  process.env.NO_COLOR = "1";
  expect(ui.fancy(new Tty())).toBe(false);
  expect(ui.paint("x", "red", new Tty())).toBe("x");
  delete process.env.NO_COLOR;
  process.env.TERM = "dumb";
  expect(ui.fancy(new Tty())).toBe(false);
});

test("status_is_the_old_plain_line_for_pipes_and_colored_glyphs_on_a_terminal", () => {
  delete process.env.NO_COLOR;
  process.env.TERM = "xterm";
  const pipe = new Tty("utf-8", false);
  expect((["ok", "warn", "fail"] as const).map(k => ui.status(k, "t", pipe))).toEqual([
    "[ok]   t",
    "[warn] t",
    "[FAIL] t",
  ]);
  expect(ui.status("ok", "t", new Tty())).toBe("\x1b[32m✓\x1b[0m t");
  expect(ui.status("fail", "t", new Tty()).startsWith("\x1b[31m✗")).toBe(true);
});

test("glyphs_fall_back_to_ascii_when_the_encoding_cannot_print_them", () => {
  delete process.env.NO_COLOR;
  process.env.TERM = "xterm";
  const line = ui.status("warn", "t", new Tty("cp1252"));
  expect(line).not.toContain("⚠");
  expect(line).toContain("[warn]");
  const okAscii = ui.status("ok", "t", new Tty("ascii"));
  expect(okAscii).not.toContain("✓");
  expect(okAscii).toContain("[ok]");
});

test("table_aligns_columns_and_leaves_the_last_one_unpadded", () => {
  process.env.NO_COLOR = "1";
  const out = ui
    .table(
      [
        ["ecs", "Elastic Cloud Server", "compute"],
        ["obs", "Object Storage", "storage"],
      ],
      ["SERVICE", "NAME", "CATEGORY"],
    )
    .split("\n");
  expect(out[0]).toBe("SERVICE  NAME                  CATEGORY");
  expect(out[1]).toBe("ecs      Elastic Cloud Server  compute");
  expect(out[2]!.indexOf("Object")).toBe(out[1]!.indexOf("Elastic"));
  expect(out[2]!.endsWith(" ")).toBe(false);
  expect(ui.table([])).toBe("");
});

test("coverage_on_a_terminal_ends_with_a_one_line_summary_and_json_flag_keeps_json", async () => {
  delete process.env.NO_COLOR;
  process.env.TERM = "xterm";
  const out = new Tty("utf-8", true);
  expect(await cli.main(["schema", "coverage", "ecs"], out)).toBe(0);
  const text = out.getvalue();
  expect(text).toContain("Coverage 16/16 controls have an option (100%); 3 set aside as unsupported and not counted.");
  expect(text.trimStart().startsWith("{")).toBe(false);

  out.clear();
  expect(await cli.main(["schema", "coverage", "ecs", "--json"], out)).toBe(0);
  expect(JSON.parse(out.getvalue()).mapped_percent).toBe(100);
});

test("coverage_through_a_pipe_is_unchanged_json", async () => {
  delete process.env.NO_COLOR;
  const pipe = new Tty("utf-8", false);
  expect(await cli.main(["schema", "coverage", "ecs"], pipe)).toBe(0);
  expect(JSON.parse(pipe.getvalue()).service).toBe("ecs");
});

test("plan_view_shows_the_price_unit_and_billing_note", () => {
  const out = ui.quoteView("plan-quote", { cards: [
    { id: "db", spec: "rds.x", price: "0.13", price_unit: "hour", unmapped_options: [] },
    { id: "cache", spec: "redis.x", price: "73.101", price_unit: "month", billing_note: "redis has no pay-per-use form, so this card is priced monthly", unmapped_options: [] },
    { id: "fn", spec: "functionstage", price: "0.0000000586", price_unit: "request", unmapped_options: [] },
  ], pending: [] })!;
  expect(out).toContain("0.13/h");
  expect(out).toContain("73.101/mo");
  expect(out).toContain("0.0000000586/request");
  expect(out).toContain("has no pay-per-use form");
  const nosql = ui.quoteView("plan-quote", { cards: [{ id: "n", spec: "geminidb.cassandra-geminifs.large.4", price: "1", price_unit: "hour", note: "engine dynamodb: DynamoDB-compatible API", unmapped_options: [] }], pending: [] })!;
  expect(nosql).toContain("engine dynamodb");
});

test("plan_view_lists_cards_and_says_whether_apply_is_ready", () => {
  const ready = { cards: [{ id: "web", spec: "c7n.large.2", price: "10", unmapped_options: [] }] };
  const stuck = { cards: [{ id: "db", candidates: [{}, {}], unmapped_options: ["x"] }] };
  expect(ui.quoteView("plan-quote", ready)).toContain("1 cards resolved; ready to apply");
  expect(ui.quoteView("plan", ready)).toContain("1 cards resolved; ready to apply");
  const out = ui.quoteView("plan-quote", stuck)!;
  expect(out).toContain("2 candidates: choose a spec");
  expect(out).toContain("1 of 1 cards need attention");
  expect(ui.quoteView("draft-quote", ready)).toBeNull();
  expect(ui.quoteView("apply-quote", { url: "https://u", name: "n", checks: [1, 2] })).toContain("https://u");
  expect(ui.quoteView("apply", { url: "https://u", name: "n", checks: [1, 2] })).toContain("https://u");
});

test("regions_and_services_commands_work_and_render_tables_on_tty", async () => {
  delete process.env.NO_COLOR;
  process.env.TERM = "xterm";
  cli.toolOverrides.list_regions = () => ({ "sa-brazil-1": "LA-Sao Paulo1", "la-south-2": "LA-Santiago" });
  cli.toolOverrides.list_services = () => [{ service: "ecs", name: "Elastic Cloud Server", category: "Compute" }];
  const tty = new Tty("utf-8", true);
  expect(await cli.main(["regions", "ecs"], tty)).toBe(0);
  expect(tty.getvalue()).toContain("REGION ID    LOCATION           PORTAL LABEL");
  expect(tty.getvalue()).toContain("sa-brazil-1  São Paulo, Brazil  LA-Sao Paulo1");
  tty.clear();
  expect(await cli.main(["services", "ecs"], tty)).toBe(0);
  expect(tty.getvalue()).toContain("SERVICE  NAME                  CATEGORY");
  expect(tty.getvalue()).toContain("ecs      Elastic Cloud Server  Compute");
});

test("tool_commands_print_exact_json_through_a_pipe", async () => {
  delete process.env.NO_COLOR;
  cli.toolOverrides.plan_quote = () => ({ cards: [], pending: [] });
  const pipe = new Tty("utf-8", false);
  expect(await cli.main(["plan-quote", "--path", "x"], pipe)).toBe(0);
  expect(JSON.parse(pipe.getvalue())).toEqual({ cards: [], pending: [] });
});

test("errors_print_the_same_text_without_color_when_stderr_is_a_pipe", () => {
  const pipe = new Tty("utf-8", false);
  expect(cli.printErr(new CalculatorError("VALIDATION", "bad", "try x"), pipe)).toBe(2);
  expect(pipe.getvalue()).toBe("error[VALIDATION]: Bad.\n  -> Try x.\n");
});

test("apply-quote shows a per-card check table, the warnings and the link", () => {
  const tty = new Tty();
  const out = ui.quoteView("apply-quote", { name: "[autocalc] x", url: "https://example.test/l", checks: [{ title: "web", stored: "140.54", rated: "140.54", edit: "140.54", ok: true }], warnings: ["A list named \"[autocalc] x\" already exists (id A); this creates another."] }, tty)!;
  expect(out).toContain("CARD");
  expect(out).toMatch(/web\s+140\.54\s+140\.54\s+140\.54\s+ok/);
  expect(out).toContain("Published [autocalc] x: 1 card verified");
  expect(out).toContain("already exists");
  expect(out.trimEnd().split("\n").at(-1)).toBe("  https://example.test/l");
});

test("plan-quote notes an ambiguous image and counts the card as needing attention", () => {
  const out = ui.quoteView("plan-quote", { cards: [{ id: "web", spec: "t6.xlarge.2.linux", price: "63.07", unmapped_options: [], image_choices: ["A", "B"] }], pending: [] }, new Tty())!;
  expect(out).toContain("image is ambiguous (2 match): set options.image");
  expect(out).toContain("1 of 1 cards need attention before apply");
});

test("plan-quote renders partition shards table when quote partitions across multiple lists", () => {
  const tty = new Tty();
  const out = ui.quoteView("plan-quote", {
    cards: [
      { id: "web-1", spec: "c7.large.2", price: "20.00" },
      { id: "web-2", spec: "c7.large.2", price: "20.00" },
    ],
    pending: [],
    shards: [
      { index: 0, title: "Acme Prod - Part 1", cardCount: 150, estimatedBytes: 500 * 1024 },
      { index: 1, title: "Acme Prod - Part 2", cardCount: 100, estimatedBytes: 350 * 1024 },
    ],
  }, tty)!;

  expect(out).toContain("Partition Shards (>200 cards or >950 KiB):");
  expect(out).toContain("Acme Prod - Part 1");
  expect(out).toContain("150 cards");
  expect(out).toContain("~500 KiB");
  expect(out).toContain("Acme Prod - Part 2");
  expect(out).toContain("100 cards");
  expect(out).toContain("~350 KiB");
  expect(out).toContain("2 cards resolved across 2 shards; ready to apply");
});

test("apply-quote renders all partition shard names and links when multi-shard quote is published", () => {
  const tty = new Tty();
  const out = ui.quoteView("apply-quote", {
    name: "Acme Prod",
    url: "https://calculator.huaweicloud.com/#/share?token=part1",
    checks: [
      { title: "web-1", stored: "20.00", rated: "20.00", edit: "20.00", ok: true },
      { title: "web-2", stored: "20.00", rated: "20.00", edit: "20.00", ok: true },
    ],
    shards: [
      { index: 0, title: "Acme Prod - Part 1", url: "https://calculator.huaweicloud.com/#/share?token=part1", cardCount: 1 },
      { index: 1, title: "Acme Prod - Part 2", url: "https://calculator.huaweicloud.com/#/share?token=part2", cardCount: 1 },
    ],
  }, tty)!;

  expect(out).toContain("Published Acme Prod: 2 cards verified across 2 lists");
  expect(out).toContain("Acme Prod - Part 1: https://calculator.huaweicloud.com/#/share?token=part1");
  expect(out).toContain("Acme Prod - Part 2: https://calculator.huaweicloud.com/#/share?token=part2");
});

test("a failed publish gate reads as one line per card, not a JSON blob", () => {
  const pipe = new Tty("utf-8", false);
  const gate = new CalculatorError("GATE_FAILED", "The list did not pass the publish gate.", undefined,
    { cards: [{ index: 0, title: "web", stored: "140.54", rated: "140.54", edit: null, problems: ["The calculator form did not appear."], ok: false }], list_id: null });
  expect(ui.formatError(gate, pipe)).toBe([
    "error[GATE_FAILED]: The list did not pass the publish gate.",
    "  [FAIL] web  stored 140.54 · rated 140.54 · Edit not checked",
    "      The calculator form did not appear.",
    "  Nothing was left saved on your account.",
    "  -> " + "The saved list is checked three ways (stored, rated, Edit view). Re-run; a page that did not load is usually transient. AUTOCALC_PAGE_HEADED=1 shows the browser.",
    "",
  ].join("\n"));
});

test("every command documented in docs/reference/cli.md runs with --help and matches reference options", async () => {
  const refPath = [resolve(import.meta.dir, "../../../../docs/reference/cli.md"), resolve(import.meta.dir, "../../docs/reference/cli.md")].find(
    p => {
      try {
        readFileSync(p, "utf8");
        return true;
      } catch {
        return false;
      }
    },
  )!;
  const doc = readFileSync(refPath, "utf8");
  // Extract every `autocalc <cmd>` from markdown table rows and code blocks
  const documented: Array<{ cmd: string[]; flags: string[] }> = [];
  for (const line of doc.split(/\r?\n/)) {
    const cellMatch = /^\|\s*`autocalc\s+([^`]+)`\s*\|/.exec(line);
    if (cellMatch) {
      const tokens = cellMatch[1]!.trim().split(/\s+/);
      const cmd = tokens[0] === "auth" && tokens[1] === "status" ? ["auth", "status"] : [tokens[0]!];
      const flags = [...line.matchAll(/--[a-z-]+/g)].map(m => m[0]);
      documented.push({ cmd, flags });
    }
    const codeMatch = /^\s*autocalc\s+([a-z-]+)\s+(.*)$/.exec(line);
    if (codeMatch) {
      const flags = [...codeMatch[2]!.matchAll(/--[a-z-]+/g)].map(m => m[0]);
      documented.push({ cmd: [codeMatch[1]!], flags });
    }
  }
  expect(documented.length).toBeGreaterThanOrEqual(16);

  const origOut = process.stdout.write;
  try {
    for (const { cmd, flags } of documented) {
      let helpText = "";
      process.stdout.write = ((chunk: string | Uint8Array) => {
        helpText += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        return true;
      }) as typeof process.stdout.write;
      const code = await cli.main([...cmd, "--help"]);
      expect(code).toBe(0);
      expect(helpText).toContain(`Usage: autocalc ${cmd.join(" ")}`);
      for (const flag of flags) {
        expect(helpText).toContain(flag);
      }
    }
  } finally {
    process.stdout.write = origOut;
  }
});
