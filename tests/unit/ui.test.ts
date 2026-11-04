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
  expect(text).toContain("Coverage 16/16 mapped (100%), 3 unsupported");
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

test("plan_view_lists_cards_and_says_whether_apply_is_ready", () => {
  const ready = { cards: [{ id: "web", spec: "c7n.large.2", price: "10", unmapped_options: [] }] };
  const stuck = { cards: [{ id: "db", candidates: [{}, {}], unmapped_options: ["x"] }] };
  expect(ui.quoteView("plan-quote", ready)).toContain("1 cards resolved; ready to apply");
  const out = ui.quoteView("plan-quote", stuck)!;
  expect(out).toContain("2 candidates: choose a spec");
  expect(out).toContain("1 of 1 cards need attention");
  expect(ui.quoteView("draft-quote", ready)).toBeNull();
  expect(ui.quoteView("apply-quote", { url: "https://u", name: "n", checks: [1, 2] })).toContain("https://u");
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
  expect(pipe.getvalue()).toBe("error[VALIDATION]: bad\n  -> try x\n");
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
