#!/usr/bin/env bun
import { Command, CommanderError } from "commander";
import { createCore, CalculatorError } from "./core/index.ts";
import { QuoteItem } from "./core/schemas.ts";
import { PositiveInteger } from "./core/schemas.ts";
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

export async function main(argv: string[]): Promise<number> {
  const program = new Command();
  program.name("autocalc").description("Huawei Cloud calculator").option("--headed", "Show browser windows").option("--profile <name>", "Authentication profile").option("--json", "Print JSON").exitOverride();
  let core: ReturnType<typeof createCore> | undefined;
  let commandFailed = false;
  let commandExit: number | undefined;
  let signalCode: number | undefined;
  const interrupt = (code: number) => { signalCode = code; void core?.close(); };
  const onInt = () => interrupt(130), onTerm = () => interrupt(143);
  process.once("SIGINT", onInt); process.once("SIGTERM", onTerm);
  const getCore = () => core ??= createCore({ ...(program.opts<{ profile?: string }>().profile ? { profile: program.opts<{ profile: string }>().profile } : {}), headed: !!program.opts<{ headed?: boolean }>().headed });
  const print = async (name: string, input: unknown) => process.stdout.write(`${JSON.stringify(await getCore().invoke(name, input), null, 2)}\n`);
  const readItems = async (file: string): Promise<unknown> => { try { return JSON.parse(file === "-" ? await Bun.stdin.text() : await readFile(file, "utf8")) as unknown; } catch { throw new CalculatorError("VALIDATION", "Could not read items JSON"); } };
  program.command("services").description("List calculator services").argument("[query]").action(async (query?: string) => { await print("list_services", { query: query ?? "" }); });
  program.command("regions").description("List calculator regions").argument("[service]").option("--region <name>", "Resolve a region name").action(async (service: string | undefined, options: { region?: string }) => { await print("list_regions", { service: service ?? "", region: options.region ?? "" }); });
  program.command("search").description("Search SKUs").argument("<service>").argument("<region>").argument("[terms...]").option("--billing <mode>").option("--vcpus <count>").option("--mem <gb>").option("--limit <count>").option("--refresh").action(async (service: string, region: string, terms: string[], options: { billing?: string; vcpus?: string; mem?: string; limit?: string; refresh?: boolean }) => { await print("search_skus", { service, region, query: terms.join(" "), limit: options.limit ?? 20, refresh: options.refresh ?? false, ...(options.billing === undefined ? {} : { billing: options.billing }), ...(options.vcpus === undefined ? {} : { min_vcpus: options.vcpus }), ...(options.mem === undefined ? {} : { min_memory_gb: options.mem }) }); });
  program.command("quote").description("Quote items in USD").argument("<region>").argument("<items...>").option("--billing <mode>").option("--hours <hours>").option("--periods <count>").option("--currency <code>", "Display a converted total using published FX rates").action(async (region: string, items: string[], options: { billing?: string; hours?: string; periods?: string; currency?: string }) => {
    const result = await getCore().invoke("quote", { region, items: items.map(parseItem), ...(options.billing === undefined ? {} : { billing: options.billing }), ...(options.hours === undefined ? {} : { hours: options.hours }), ...(options.periods === undefined ? {} : { periods: options.periods }) });
    if (options.currency && result && typeof result === "object" && typeof (result as Record<string, unknown>).total === "number") {
      const output = await quoteWithConversion(result as Record<string, unknown> & { total: number }, options.currency, (amount, currency) => getCore().invoke("convert_currency", { amount_usd: amount, currency }));
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });
  program.command("convert").description("Convert a USD amount").argument("<amount>").argument("<currency>").action(async (amount: string, currency: string) => { await print("convert_currency", { amount_usd: amount, currency }); });
  program.command("supported").description("List supported card builders").action(async () => { await print("supported_services", {}); });
  program.command("describe").description("Describe service availability").argument("<service>").option("--region <name>").action(async (service: string, options: { region?: string }) => { await print("describe_service", { service, ...(options.region === undefined ? {} : { region: options.region }) }); });
  program.command("create").description("Build or save a price list").argument("<name>").requiredOption("--items <file>", "JSON card array, or - for stdin").option("--dry-run", "Build without saving").option("--currency <currency>").option("--settlement <mode>").action(async (name: string, options: { items: string; dryRun?: boolean; currency?: string; settlement?: string }) => {
    const items = await readItems(options.items);
    await print("create_price_list", { name, items, dry_run: options.dryRun ?? false, ...(options.currency === undefined ? {} : { currency: options.currency }), ...(options.settlement === undefined ? {} : { settlement: options.settlement }) });
  });
  program.command("read").description("Read a shared price list").argument("<url_or_id>").action(async (urlOrId: string) => {
    await print("read_price_list", { url_or_id: urlOrId });
  });
  program.command("update").description("Replace the cards in a saved price list").argument("<url_or_id>").requiredOption("--items <file>", "JSON card array, or - for stdin").option("--dry-run", "Build without saving").action(async (urlOrId: string, options: { items: string; dryRun?: boolean }) => {
    const result = await getCore().updatePriceList(urlOrId, await readItems(options.items), { dryRun: !!options.dryRun });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });
  program.command("validate").description("Validate a shared price list").argument("<url_or_id>").action(async (urlOrId: string) => { const result = await getCore().validate(urlOrId); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) commandFailed = true; });
  program.command("render-check").description("Check anonymous calculator rendering").argument("<url_or_id>").action(async (urlOrId: string) => { const result = await getCore().renderCheck(urlOrId); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) commandFailed = true; });
  program.command("edit-check").description("Compare saved cards with anonymous Edit pricing").argument("<url_or_id>").option("--limit <count>").option("--screenshots <directory>", "Save a screenshot for each checked card").action(async (urlOrId: string, options: { limit?: string; screenshots?: string }) => { const parsed = options.limit === undefined ? undefined : PositiveInteger.safeParse(options.limit); if (parsed && !parsed.success) throw new CalculatorError("VALIDATION", "Limit must be a positive integer"); const result = await getCore().editCheck(urlOrId, parsed?.data, options.screenshots); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) commandFailed = true; });
  program.command("doctor").description("Check public calculator endpoints and local auth status").action(async () => { const result = await getCore().doctor(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.ok) commandFailed = true; });
  program.command("install-browser").description("Install the pinned Playwright Chromium revision").action(async () => { const processHandle = Bun.spawn([process.execPath, "--bun", playwrightCliPath(), "install", "chromium"], { stdout: "pipe", stderr: "pipe" }); const [stdout, stderr, status] = await Promise.all([new Response(processHandle.stdout).text(), new Response(processHandle.stderr).text(), processHandle.exited]); if (stdout) process.stderr.write(stdout); if (stderr) process.stderr.write(stderr); if (status !== 0) commandExit = status; });
  program.command("compare-modes").description("Compare billing modes").requiredOption("--items <file>", "JSON quote items or - for stdin").option("--region <region>").option("--modes <modes>", "Comma-separated modes").option("--currency <currency>").action(async (options: { items: string; region?: string; modes?: string; currency?: string }) => { await print("compare_modes", { items: await readItems(options.items), ...(options.region ? { region: options.region } : {}), ...(options.modes ? { modes: options.modes.split(",") } : {}), ...(options.currency ? { currency: options.currency } : {}) }); });
  program.command("compare-regions").description("Compare region prices").requiredOption("--items <file>", "JSON quote items or - for stdin").requiredOption("--regions <regions>", "Comma-separated regions").option("--mode <mode>").action(async (options: { items: string; regions: string; mode?: string }) => { await print("compare_regions", { items: await readItems(options.items), regions: options.regions.split(","), ...(options.mode ? { mode: options.mode } : {}) }); });
  program.command("lists").description("List your saved price lists").action(async () => { await print("list_my_price_lists", {}); });
  program.command("delete").description("Delete a saved price list").argument("<url_or_id>").option("--yes", "Confirm deletion").action(async (urlOrId: string, options: { yes?: boolean }) => { if (!options.yes) throw new CalculatorError("VALIDATION", "Deletion requires --yes"); await print("delete_price_list", { url_or_id: urlOrId }); });
  program.command("rename").description("Rename a saved price list").argument("<url_or_id>").argument("<name>").action(async (urlOrId: string, name: string) => { await print("rename_price_list", { url_or_id: urlOrId, new_name: name }); });
  program.command("duplicate").description("Copy a saved price list").argument("<url_or_id>").option("--name <name>").action(async (urlOrId: string, options: { name?: string }) => { await print("duplicate_price_list", { url_or_id: urlOrId, ...(options.name ? { new_name: options.name } : {}) }); });
  program.command("login").description("Sign in through a browser").option("--timeout <seconds>", "Login deadline, default 300 seconds").option("--profile <name>").action(async (options: { timeout?: string; profile?: string }) => { if (options.profile) program.setOptionValue("profile", options.profile); await print("auth_login", options.timeout === undefined ? {} : { timeout: options.timeout }); });
  const auth = program.command("auth").description("Inspect or import authentication");
  auth.command("status").description("Show local session metadata").action(async () => { await print("auth_status", {}); });
  auth.command("import").description("Import a cURL session from a file, stdin, or Windows clipboard").argument("[file]").option("--clipboard", "Read the Windows clipboard").action(async (file: string | undefined, options: { clipboard?: boolean }) => {
    if (file && options.clipboard) throw new CalculatorError("VALIDATION", "Provide a file or --clipboard, not both");
    let text: string;
    if (options.clipboard || !file) {
      const executable = Bun.which("powershell.exe");
      if (!executable) throw new CalculatorError("VALIDATION", "Windows PowerShell is unavailable");
      const child = Bun.spawn([executable, "-NoProfile", "-Command", "Get-Clipboard -Raw"], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => child.kill(), 20000);
      try {
        const [output, , status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        if (status !== 0) throw new CalculatorError("UPSTREAM", "Could not read the Windows clipboard");
        text = output;
      } finally { clearTimeout(timer); }
    } else text = file === "-" ? await Bun.stdin.text() : await readFile(file!, "utf8");
    process.stdout.write(`${JSON.stringify(await getCore().importAuth(text), null, 2)}\n`);
  });
  program.command("logout").description("Clear the current profile session").action(async () => { await getCore().logout(); process.stdout.write("Logged out\n"); });
  try { await program.parseAsync(argv); return signalCode ?? commandExit ?? (commandFailed ? 1 : 0); }
  catch (error) {
    if (signalCode !== undefined) return signalCode;
    if (error instanceof CommanderError) return error.exitCode;
    if (error instanceof CalculatorError) { if (program.opts<{ json?: boolean }>().json) process.stderr.write(`${JSON.stringify(error.toJSON())}\n`); else process.stderr.write(`error[${error.code}]: ${error.message}\n${error.hint ? `  -> ${error.hint}\n` : ""}${error.details ? `  ${JSON.stringify(error.details)}\n` : ""}`); return 2; }
    process.stderr.write("Unexpected error\n"); return 1;
  } finally { process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm); await core?.close(); }
}
if (import.meta.main) process.exitCode = await main(process.argv);
