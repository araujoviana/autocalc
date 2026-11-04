#!/usr/bin/env bun
import { Command, CommanderError } from "commander";
import pkg from "../package.json";
import { createCore, CalculatorError } from "./core/index.ts";
import { setProgress } from "./core/progress.ts";
import { registry } from "./core/registry.ts";
import { QuoteItem, PositiveInteger } from "./core/schemas.ts";
import * as ui from "./core/ui.ts";
import { update as runUpdate, withNotice } from "./core/update.ts";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function playwrightCliPath(): string { return fileURLToPath(new URL("./cli.js", import.meta.resolve("playwright"))); }

export function parseItem(value: string) {
  const match = /^([^:]+):([^*@]+)(?:\*([^@]+))?(?:@(.+))?$/.exec(value);
  if (!match) throw new CalculatorError("VALIDATION", `Invalid quote item ${value}`, "Use service:spec[*quantity][@size].");
  const parsed = QuoteItem.safeParse({ service: match[1], spec: match[2], ...(match[3] ? { quantity: match[3] } : {}), ...(match[4] ? { size: match[4] } : {}) });
  if (!parsed.success) throw new CalculatorError("VALIDATION", `Invalid quote item ${value}`);
  return parsed.data;
}

export async function quoteWithConversion(quote: Record<string, unknown> & { total: number }, currency: string, convert: (amount: number, currency: string) => Promise<unknown>) {
  const value = await convert(quote.total, currency);
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { ...quote, converted: { currency: currency.toUpperCase(), rate: typeof result.rate === "number" ? result.rate : null, total: typeof result.amount === "number" ? result.amount : null } };
}

export function printErr(exc: CalculatorError, stream: ui.StreamLike & { write?: (s: string) => unknown } = process.stderr): number {
  const text = ui.formatError(exc, stream);
  if (typeof stream.write === "function") stream.write(text);
  else process.stderr.write(text);
  return 2;
}

export const toolOverrides: Record<string, (input: Record<string, unknown>) => unknown> = {};

async function readJsonArg(value: string): Promise<unknown> {
  try {
    if (value === "-") return JSON.parse(await Bun.stdin.text()) as unknown;
    if (value.startsWith("@")) return JSON.parse(await readFile(value.slice(1), "utf8")) as unknown;
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed) as unknown;
    return JSON.parse(await readFile(value, "utf8")) as unknown;
  } catch {
    throw new CalculatorError("VALIDATION", `Could not read JSON argument: ${value}`);
  }
}

export async function main(argv: string[], outStream?: ui.StreamLike & { write?: (s: string) => unknown }): Promise<number> {
  const writeOut = (text: string) => {
    if (outStream && typeof outStream.write === "function") outStream.write(`${text}\n`);
    else process.stdout.write(`${text}\n`);
  };
  const program = new Command();
  program.name("autocalc").description("Huawei Cloud calculator").version(`autocalc ${pkg.version}`, "--version").option("--headed", "Show browser windows").option("--profile <name>", "Authentication profile").option("--json", "Print JSON").exitOverride();
  let core: ReturnType<typeof createCore> | undefined;
  let commandFailed = false;
  let commandExit: number | undefined;
  let signalCode: number | undefined;
  const interrupt = (code: number) => { signalCode = code; void core?.close(); };
  const onInt = () => interrupt(130), onTerm = () => interrupt(143);
  process.once("SIGINT", onInt); process.once("SIGTERM", onTerm);
  const getCore = () => core ??= createCore({ ...(program.opts<{ profile?: string }>().profile ? { profile: program.opts<{ profile: string }>().profile } : {}), headed: !!program.opts<{ headed?: boolean }>().headed });
  /** A terminal gets the readable view for `cmd`; a pipe or --json gets the JSON. */
  const show = (cmd: string, result: unknown) => {
    const human = !program.opts<{ json?: boolean }>().json && ui.fancy(outStream) ? ui.quoteView(cmd, result, outStream) : null;
    writeOut(human ?? JSON.stringify(result, null, 2));
  };
  const print = async (name: string, input: unknown, view?: string) => show(view ?? name, withNotice(await getCore().invoke(name, input)));
  program.command("services").description("List calculator services").argument("[query]").action(async (query?: string) => { await print("list_services", { query: query ?? "" }); });
  program.command("regions").description("List calculator regions").argument("[service]").option("--region <name>", "Resolve a region name").action(async (service: string | undefined, options: { region?: string }) => { await print("list_regions", { service: service ?? "", region: options.region ?? "" }); });
  program.command("search").description("Search SKUs").argument("<service>").argument("<region>").argument("[terms...]").option("--billing <mode>").option("--vcpus <count>").option("--mem <gb>").option("--limit <count>").option("--refresh").action(async (service: string, region: string, terms: string[], options: { billing?: string; vcpus?: string; mem?: string; limit?: string; refresh?: boolean }) => { await print("search_skus", { service, region, query: terms.join(" "), limit: options.limit ?? 20, refresh: options.refresh ?? false, ...(options.billing === undefined ? {} : { billing: options.billing }), ...(options.vcpus === undefined ? {} : { min_vcpus: options.vcpus }), ...(options.mem === undefined ? {} : { min_memory_gb: options.mem }) }, "search"); });
  program.command("quote").description("Quote items in USD").argument("<region>").argument("<items...>").option("--billing <mode>").option("--hours <hours>").option("--periods <count>").option("--currency <code>", "Display a converted total using published FX rates").action(async (region: string, items: string[], options: { billing?: string; hours?: string; periods?: string; currency?: string }) => {
    const result = await getCore().invoke("quote", { region, items: items.map(parseItem), ...(options.billing === undefined ? {} : { billing: options.billing }), ...(options.hours === undefined ? {} : { hours: options.hours }), ...(options.periods === undefined ? {} : { periods: options.periods }) });
    if (options.currency && result && typeof result === "object" && typeof (result as Record<string, unknown>).total === "number") {
      const output = await quoteWithConversion(result as Record<string, unknown> & { total: number }, options.currency, (amount, currency) => getCore().invoke("convert_currency", { amount_usd: amount, currency }));
      show("quote", output);
    } else show("quote", result);
  });
  program.command("convert").description("Convert a USD amount").argument("<amount>").argument("<currency>").action(async (amount: string, currency: string) => { await print("convert_currency", { amount_usd: amount, currency }); });
  program.command("page-controls").description("List the controls of a service's calculator page").argument("<service>").action(async (service: string) => {
    const { BrowserManager } = await import("./core/browser.ts"), { pageControls } = await import("./core/page/controls.ts"), manager = new BrowserManager({ headed: process.env.AUTOCALC_PAGE_HEADED === "1" || !!program.opts<{ headed?: boolean }>().headed });
    try { writeOut(JSON.stringify(await pageControls(manager, service), null, 2)); } finally { await manager.close(); }
  });
  program.command("schema").description("Manage service page schemas (pull, coverage, diff)").argument("<action>").argument("<service>").option("--json", "print JSON even on a terminal").action(async (action: string, service: string, options: { json?: boolean }) => {
    if (!["pull", "coverage", "diff"].includes(action)) throw new CalculatorError("VALIDATION", `Invalid schema action ${action}`, "Choose from pull, coverage, diff.");
    const { runSchemaCommand } = await import("./core/schema-model.ts");
    const asJson = Boolean(options.json || program.opts<{ json?: boolean }>().json);
    const code = await runSchemaCommand(action, service, {
      headed: process.env.AUTOCALC_PAGE_HEADED === "1" || !!program.opts<{ headed?: boolean }>().headed,
      asJson,
      ...(outStream ? { stream: outStream } : {}),
      write: text => writeOut(text),
    });
    if (code !== 0) commandExit = code;
  });
  program.command("supported").description("List supported card builders").action(async () => { await print("supported_services", {}); });
  program.command("describe").description("Describe service availability").argument("<service>").option("--region <name>").action(async (service: string, options: { region?: string }) => { await print("describe_service", { service, ...(options.region === undefined ? {} : { region: options.region }) }); });
  program.command("read").description("Read a shared price list").argument("<url_or_id>").action(async (urlOrId: string) => {
    await print("read_price_list", { url_or_id: urlOrId });
  });
  program.command("validate").description("Validate a shared price list").argument("<url_or_id>").action(async (urlOrId: string) => { const result = await getCore().validate(urlOrId); show("validate", result); if (!result.ok) commandFailed = true; });
  program.command("render-check").description("Check anonymous calculator rendering").argument("<url_or_id>").action(async (urlOrId: string) => { const result = await getCore().renderCheck(urlOrId); writeOut(JSON.stringify(result, null, 2)); if (!result.ok) commandFailed = true; });
  program.command("edit-check").description("Compare saved cards with anonymous Edit pricing").argument("<url_or_id>").option("--limit <count>").option("--screenshots <directory>", "Save a screenshot for each checked card").action(async (urlOrId: string, options: { limit?: string; screenshots?: string }) => { const parsed = options.limit === undefined ? undefined : PositiveInteger.safeParse(options.limit); if (parsed && !parsed.success) throw new CalculatorError("VALIDATION", "Limit must be a positive integer"); const result = await getCore().editCheck(urlOrId, parsed?.data, options.screenshots); show("edit-check", result); if (!result.ok) commandFailed = true; });
  program.command("doctor").description("Check public calculator endpoints and local auth status").action(async () => { const result = await getCore().doctor(); show("doctor", result); if (!result.ok) commandFailed = true; });
  program.command("install-browser").description("Install the pinned Playwright Chromium revision").action(async () => { const processHandle = Bun.spawn([process.execPath, "--bun", playwrightCliPath(), "install", "chromium"], { stdout: "pipe", stderr: "pipe" }); const [stdout, stderr, status] = await Promise.all([new Response(processHandle.stdout).text(), new Response(processHandle.stderr).text(), processHandle.exited]); if (stdout) process.stderr.write(stdout); if (stderr) process.stderr.write(stderr); if (status !== 0) commandExit = status; });
  program.command("update").description("move to the newest release").option("--to <tag>", "a release tag, vX.Y.Z (default: the newest)").action(async (options: { to?: string }) => { writeOut(runUpdate(options.to)); });
  program.command("compare-modes").description("Compare billing modes").requiredOption("--items <file>", "JSON quote items or - for stdin").option("--region <region>").option("--modes <modes>", "Comma-separated modes").option("--currency <currency>").option("--hours <hours>").option("--periods <count>").action(async (options: { items: string; region?: string; modes?: string; currency?: string; hours?: string; periods?: string }) => { await print("compare_modes", { items: await readJsonArg(options.items), ...(options.region ? { region: options.region } : {}), ...(options.modes ? { modes: options.modes.split(",") } : {}), ...(options.currency ? { currency: options.currency } : {}), ...(options.hours ? { hours: options.hours } : {}), ...(options.periods ? { periods: options.periods } : {}) }); });
  program.command("compare-regions").description("Compare region prices").requiredOption("--items <file>", "JSON quote items or - for stdin").requiredOption("--regions <regions>", "Comma-separated regions").option("--billing <mode>").action(async (options: { items: string; regions: string; billing?: string }) => { await print("compare_regions", { items: await readJsonArg(options.items), regions: options.regions.split(","), ...(options.billing ? { billing: options.billing } : {}) }); });
  program.command("lists").description("List your saved price lists").action(async () => { await print("list_my_price_lists", {}, "lists"); });
  program.command("delete").description("Delete a saved price list").argument("<url_or_id>").option("--yes", "Confirm deletion").action(async (urlOrId: string, options: { yes?: boolean }) => { if (!options.yes) throw new CalculatorError("VALIDATION", "Deletion requires --yes"); await print("delete_price_list", { url_or_id: urlOrId }); });
  program.command("rename").description("Rename a saved price list").argument("<url_or_id>").argument("<name>").action(async (urlOrId: string, name: string) => { await print("rename_price_list", { url_or_id: urlOrId, new_name: name }); });
  program.command("duplicate").description("Copy a saved price list").argument("<url_or_id>").option("--name <name>").action(async (urlOrId: string, options: { name?: string }) => { await print("duplicate_price_list", { url_or_id: urlOrId, ...(options.name ? { new_name: options.name } : {}) }); });
  program.command("login").description("Sign in through a browser").option("--timeout <seconds>", "Login deadline, default 300 seconds").option("--profile <name>").action(async (options: { timeout?: string; profile?: string }) => { if (options.profile) program.setOptionValue("profile", options.profile); await print("auth_login", options.timeout === undefined ? {} : { timeout: options.timeout }); });
  const auth = program.command("auth").description("Inspect authentication");
  auth.command("status").description("Show local session metadata").option("--profile <name>").action(async (options: { profile?: string }) => { if (options.profile) program.setOptionValue("profile", options.profile); await print("auth_status", {}); });
  program.command("logout").description("Clear the current profile session").option("--profile <name>").action(async (options: { profile?: string }) => { if (options.profile) program.setOptionValue("profile", options.profile); await getCore().logout(); writeOut("Logged out"); });

  const taken = new Set(program.commands.map(c => c.name()));
  for (const [name, entry] of Object.entries(registry)) {
    const cmd = name.replaceAll("_", "-");
    if (taken.has(cmd)) continue;
    const sub = program.command(cmd).description(entry.description.split("\n")[0]!);
    const shape = (entry.schema as unknown as { shape?: Record<string, any> }).shape ?? {};
    const jsonFields = new Set<string>();
    for (const [propName, propSchema] of Object.entries(shape)) {
      const optFlag = propName.replaceAll("_", "-");
      const isBool = propSchema.safeParse(true).success && !propSchema.safeParse("not_a_bool").success;
      const isJson = propSchema.safeParse([]).success || propSchema.safeParse({}).success;
      const isOptional = propSchema.safeParse(undefined).success;
      if (isJson) jsonFields.add(propName);
      if (isBool) {
        sub.option(`--${optFlag}`).option(`--no-${optFlag}`);
      } else if (isJson) {
        if (isOptional) sub.option(`--${optFlag} <JSON|@FILE>`);
        else sub.requiredOption(`--${optFlag} <JSON|@FILE>`);
      } else {
        if (isOptional) sub.option(`--${optFlag} <value>`);
        else sub.requiredOption(`--${optFlag} <value>`);
      }
    }
    sub.action(async (opts: Record<string, unknown>) => {
      const rawInput: Record<string, unknown> = {};
      for (const propName of Object.keys(shape)) {
        const camelKey = propName.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        const val = opts[camelKey];
        if (val !== undefined) {
          rawInput[propName] = jsonFields.has(propName) && typeof val === "string" ? await readJsonArg(val) : val;
        }
      }
      const rawResult = toolOverrides[name] ? await toolOverrides[name]!(rawInput) : await getCore().invoke(name, rawInput);
      const result = withNotice(rawResult);
      const asJson = Boolean(program.opts<{ json?: boolean }>().json);
      const human = !asJson && ui.fancy(outStream) ? ui.quoteView(cmd, result, outStream) : null;
      writeOut(human ?? JSON.stringify(result, null, 2));
    });
  }

  const isUserArgs = argv.length > 0 && !argv[0]!.includes("/") && !argv[0]!.includes("\\") && argv[0] !== "node" && argv[0] !== "bun";
  if (!argv.includes("--json") && ui.fancy(process.stderr)) setProgress(message => process.stderr.write(`${ui.paint("…", "dim", process.stderr)} ${message}\n`));
  try { await program.parseAsync(argv, isUserArgs ? { from: "user" } : undefined); return signalCode ?? commandExit ?? (commandFailed ? 1 : 0); }
  catch (error) {
    if (signalCode !== undefined) return signalCode;
    if (error instanceof CommanderError) return error.exitCode;
    if (error instanceof CalculatorError) { if (program.opts<{ json?: boolean }>().json) process.stderr.write(`${JSON.stringify(error.toJSON())}\n`); else printErr(error, process.stderr); return 2; }
    process.stderr.write("Unexpected error\n"); return 1;
  } finally { setProgress(null); process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm); await core?.close(); }
}
if (import.meta.main) process.exitCode = await main(process.argv);
