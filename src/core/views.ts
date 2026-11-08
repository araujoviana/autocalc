/** Terminal views for all CLI commands. Formats every command as readable tables, status verdicts, and summaries. */

import { formatRegion, regionLocation } from "./regions.ts";
import { kv, paint, status, table, type StreamLike } from "./ui.ts";

type Row = Record<string, any>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
/** Two decimals, except that a sub-dollar amount (an hourly price) keeps up to four, so 0.0274 does not read as 0.03. */
const money = (v: unknown): string => typeof v === "number" ? (v !== 0 && Math.abs(v) < 1 ? String(Number(v.toFixed(4))) : v.toFixed(2)) : v == null || v === "" ? "-" : String(v);
const clip = (text: string, max: number): string => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const date = (ms: unknown): string => typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "-";

function appendNotice(text: string, r: unknown, s?: StreamLike): string {
  if (isRow(r) && typeof r.update_notice === "string" && r.update_notice) {
    return `${text}\n${status("warn", r.update_notice, s)}`;
  }
  return text;
}

function lists(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow).sort((a, b) => Number(b.updated ?? 0) - Number(a.updated ?? 0));
  if (!items.length) return "No saved lists on this account.";
  const amount = (t: unknown) => isRow(t) ? money(t.amount) : money(t);
  const body = items.map(r => [clip(String(r.name ?? "-"), 40), amount(r.total), date(r.updated), String(r.id ?? "")]);
  return `${table(body, ["NAME", "TOTAL USD", "UPDATED", "ID"], s)}\n${paint(`${items.length} list${items.length === 1 ? "" : "s"}, newest first`, "dim", s)}`;
}

function validate(r: Row, s?: StreamLike): string {
  const issues: string[] = Array.isArray(r.issues) ? r.issues.map(String) : [];
  const head = `${r.items ?? 0} item${r.items === 1 ? "" : "s"}, total ${money(r.total)}` + (r.ok ? "; no issues" : `; ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
  return [status(r.ok ? "ok" : "fail", head, s), ...issues.map(i => `  ${i}`)].join("\n");
}

function editCheck(r: Row, s?: StreamLike): string {
  const results: Row[] = Array.isArray(r.results) ? r.results.filter(isRow) : [];
  const body = results.map(c => [clip(String(c.title ?? c.index), 36), String(c.status), money(c.stored), money(c.edit), money(c.delta)]);
  const warns = results.flatMap(c => (Array.isArray(c.warnings) ? c.warnings : []).map((w: unknown) => status("warn", `${String(c.title ?? c.index)}: ${String(w)}`, s)));
  const summary = status(r.ok ? "ok" : "fail", `${results.length} card${results.length === 1 ? "" : "s"} ${r.ok ? "re-price to the stored amount" : "checked; see mismatches above"}`, s);
  return [body.length ? table(body, ["CARD", "STATUS", "STORED", "EDIT", "DELTA"], s) : "", summary, ...warns].filter(Boolean).join("\n");
}

function renderCheckView(r: Row, s?: StreamLike): string {
  const head = r.ok
    ? `Rendered shared list ${String(r.id ?? "")} (${String(r.cards ?? 0)} card${r.cards === 1 ? "" : "s"} visible)`
    : `Failed to render shared list ${String(r.id ?? "")}`;
  return status(r.ok ? "ok" : "fail", head, s);
}

function doctor(r: Row, s?: StreamLike): string {
  const checks: Row[] = Array.isArray(r.checks) ? r.checks.filter(isRow) : [];
  const lines = checks.map(c => status(c.ok ? "ok" : "fail", `${String(c.name)} endpoint` + (!c.ok && c.error ? `: ${String(c.error)}` : ""), s));
  const auth = isRow(r.auth) ? r.auth : {};
  const age = typeof auth.age_hours === "number" ? `, session ${auth.age_hours.toFixed(1)} h old` : "";
  const isAuthed = auth.authenticated === false ? false : Boolean(auth.logged_in);
  const authLabel = auth.authenticated === false
    ? `session expired (profile ${String(auth.profile ?? "default")}${age}; run autocalc login)`
    : auth.logged_in
      ? `signed in (profile ${String(auth.profile ?? "default")}${age})`
      : `not signed in (${String(auth.hint ?? "run autocalc login")})`;
  lines.push(status(isAuthed ? "ok" : "warn", authLabel, s));
  if (isRow(r.frontend)) {
    const ver = r.frontend.version ? String(r.frontend.version) : "unknown";
    const fWarns: string[] = Array.isArray(r.frontend.warnings) ? r.frontend.warnings.map(String) : [];
    lines.push(status(fWarns.length ? "warn" : "ok", `frontend version ${ver}${fWarns.length ? ` (${fWarns.length} schema warning${fWarns.length === 1 ? "" : "s"})` : ""}`, s));
    for (const w of fWarns.slice(0, 5)) lines.push(`  ${paint("•", "yellow", s)} ${w}`);
  }
  const meta = kv([
    ["browser", r.browser],
    ["profile", r.profile_dir],
    ["cache", r.cache_dir],
  ], s);
  if (meta) lines.push(meta);
  return lines.join("\n");
}

function formatSkuDescription(d: unknown): string {
  const t = String(d ?? "");
  const v = /vCPUs:\s*(\d+)/.exec(t);
  const m = /Memory:\s*(\d+)MB/.exec(t);
  if (v && m) return `${v[1]} vCPU, ${Number(m[1]) / 1024} GB`;
  const parts = t
    .split(";")
    .map(p => p.trim())
    .filter(p => p && !/^(CPU Architecture|Type|Series|Spot|Local Disk|Remark|accelerator card):/i.test(p))
    .map(p => p.replace(/:/g, ": "));
  return clip(parts.length ? parts.join(" · ") : t, 52);
}

function search(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow);
  if (!items.length) return "No SKUs match.";
  const modes = (["ondemand", "monthly", "yearly"] as const).filter(m => items.some(r => r[m] != null));
  return `${table(items.map(r => [String(r.spec), ...modes.map(m => money(r[m])), formatSkuDescription(r.description)]), ["SPEC", ...modes.map(m => m.toUpperCase()), "SIZE"], s)}\n${paint("List prices in USD.", "dim", s)}`;
}

function quote(r: Row, s?: StreamLike): string {
  const items: Row[] = Array.isArray(r.items) ? r.items.filter(isRow) : [];
  const loc = typeof r.region === "string" ? regionLocation(r.region) : "";
  const head = paint([loc && loc !== r.region ? loc : null, r.region, r.billing, r.term].filter(Boolean).join(" · "), "bold", s);
  const body = items.map(i => [String(i.service), String(i.spec), String(i.quantity ?? 1), i.size == null ? "-" : String(i.size), money(i.amount)]);
  const total = `TOTAL ${money(r.total)} ${String(r.currency ?? "USD")}` + (Number(r.discount) > 0 ? `  (discount ${money(r.discount)}, list price ${money(r.list_price)})` : "");
  const conv = isRow(r.converted) && r.converted.total != null ? `\n= ${money(r.converted.total)} ${String(r.converted.currency)} at ${String(r.converted.rate)}` : "";
  return appendNotice(`${head}\n${table(body, ["SERVICE", "SPEC", "QTY", "SIZE", "AMOUNT"], s)}\n${paint(total, "bold", s)}${conv}`, r, s);
}

function servicesView(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow);
  if (!items.length) return "No services match.";
  const body = items.map(r => [String(r.service ?? ""), String(r.name ?? ""), String(r.category ?? "")]);
  return `${table(body, ["SERVICE", "NAME", "CATEGORY"], s)}\n${paint(`${items.length} services.`, "dim", s)}`;
}

function regionsView(r: Row, s?: StreamLike): string {
  const entries = Object.entries(r).filter(([k]) => k !== "update_notice").sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return "No regions found.";
  return appendNotice(
    `${table(entries.map(([id, portalName]) => [id, regionLocation(id, String(portalName)), String(portalName)]), ["REGION ID", "LOCATION", "PORTAL LABEL"], s)}\n${paint(`${entries.length} regions. Pass either the REGION ID (e.g. sa-brazil-1) or LOCATION (e.g. "São Paulo").`, "dim", s)}`,
    r,
    s,
  );
}

function supportedView(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow);
  if (!items.length) return "No supported services.";
  const body = items.map(r => [
    String(r.service ?? ""),
    String(r.description ?? ""),
    Array.isArray(r.modes) ? r.modes.join(", ") : "",
    r.publication_supported ? "verified" : "catalog-only",
  ]);
  return `${table(body, ["SERVICE", "NAME", "MODES", "PUBLISH GATE"], s)}\n${paint(`${items.filter(r => r.publication_supported).length}/${items.length} verified for publish.`, "dim", s)}`;
}

function describeView(r: Row, s?: StreamLike): string {
  const svc = String(r.service ?? "");
  const reg = String(r.region ?? "");
  const loc = regionLocation(reg);
  const builders: Row[] = Array.isArray(r.builders) ? r.builders.filter(isRow) : [];
  const builderName = builders[0]?.description ? `${String(builders[0].description)} (${svc})` : svc;
  const modes = Array.isArray(r.modes_in_region) && r.modes_in_region.length
    ? r.modes_in_region.map(m => String(m).toLowerCase()).join(", ")
    : "none";
  const builderModes = builders[0] && Array.isArray(builders[0].modes) ? builders[0].modes.join(", ") : "";
  const lines: string[] = [
    paint(`${builderName} · ${loc} (${reg})`, "bold", s),
    status(r.sold_in_region ? "ok" : "fail", r.sold_in_region ? `Sold in ${formatRegion(reg)} (modes: ${modes})` : `Not sold in ${formatRegion(reg)}`, s),
  ];
  if (builders.length) {
    lines.push(status("ok", `Publish gate builder verified (supported modes: ${builderModes})`, s));
  }
  if (isRow(r.groups)) {
    const groupEntries = Object.entries(r.groups);
    if (groupEntries.length) {
      const rows = groupEntries.map(([name, info]) => {
        const g = isRow(info) ? info : {};
        const samples = Array.isArray(g.sample_specs) ? g.sample_specs.slice(0, 4).join(", ") : "";
        return [name, String(g.count ?? 0), clip(samples, 64)];
      });
      lines.push("", table(rows, ["CATALOG GROUP", "SKUS", "SAMPLE SPECS"], s));
    }
  }
  lines.push(paint(`Tip: Run 'autocalc search ${svc} ${reg}' to browse SKUs and prices.`, "dim", s));
  return appendNotice(lines.join("\n"), r, s);
}

function convertView(r: Row, s?: StreamLike): string {
  const usd = money(r.usd ?? r.amount_usd);
  const cur = String(r.currency ?? "");
  if (r.error) {
    const avail = Array.isArray(r.available) && r.available.length ? ` (available: ${r.available.join(", ")})` : "";
    return status("fail", `${String(r.error)}${avail}`, s);
  }
  const amt = money(r.amount);
  const rate = r.rate != null ? String(r.rate) : "-";
  return appendNotice(`${paint(`${usd} USD`, "bold", s)} = ${paint(`${amt} ${cur}`, "green", s)}  ${paint(`(rate: 1 USD = ${rate} ${cur})`, "dim", s)}`, r, s);
}

function compareModesView(r: Row, s?: StreamLike): string {
  const reg = String(r.region ?? "");
  const loc = regionLocation(reg);
  const cur = typeof r.currency === "string" && r.currency !== "USD" ? r.currency : null;
  const modes: Row[] = Array.isArray(r.modes) ? r.modes.filter(isRow) : [];
  const head = paint(
    `${loc && loc !== reg ? `${loc} · ` : ""}${reg} · ${String(r.hours ?? 730)}h on-demand / ${String(r.periods ?? 1)} period(s)` +
      (cur && r.rate ? ` · 1 USD = ${String(r.rate)} ${cur}` : ""),
    "bold",
    s,
  );
  const headers = cur
    ? ["MODE", "TOTAL USD", "MONTHLY USD", `TOTAL ${cur}`, `MONTHLY ${cur}`, "VS ON-DEMAND"]
    : ["MODE", "TOTAL USD", "MONTHLY EQUIV", "VS ON-DEMAND"];
  const rows = modes.map(m => {
    if (m.error) {
      return cur
        ? [String(m.mode), "-", "-", "-", "-", `unavailable (${String(m.error)})`]
        : [String(m.mode), "-", "-", `unavailable (${String(m.error)})`];
    }
    const saving = typeof m.saving_vs_ondemand_pct === "number"
      ? m.saving_vs_ondemand_pct === 0
        ? "baseline"
        : m.saving_vs_ondemand_pct > 0
          ? `-${m.saving_vs_ondemand_pct.toFixed(1)}% cheaper`
          : `+${Math.abs(m.saving_vs_ondemand_pct).toFixed(1)}%`
      : "-";
    return cur
      ? [String(m.mode), money(m.total_usd), money(m.monthly_equivalent_usd), money(m.total), money(m.monthly_equivalent), saving]
      : [String(m.mode), money(m.total_usd), money(m.monthly_equivalent_usd), saving];
  });
  return appendNotice(`${head}\n${table(rows, headers, s)}`, r, s);
}

function compareRegionsView(r: Row, s?: StreamLike): string {
  const billing = String(r.billing ?? "ondemand");
  const regions: Row[] = Array.isArray(r.regions) ? r.regions.filter(isRow) : [];
  const priced = regions.filter(x => typeof x.total_usd === "number");
  const minPrice = priced.length ? Math.min(...priced.map(x => Number(x.total_usd))) : null;
  const rows = regions.map(x => {
    const id = String(x.region ?? "");
    const loc = regionLocation(id);
    if (x.error) {
      return [id, loc, "-", `${String(x.error)}: ${String(x.message ?? "unavailable")}`];
    }
    const total = Number(x.total_usd);
    let note = "ok";
    if (minPrice !== null && minPrice > 0) {
      if (Math.abs(total - minPrice) < 1e-6) note = "✓ cheapest";
      else note = `+${(((total - minPrice) / minPrice) * 100).toFixed(1)}% vs cheapest`;
    }
    return [id, loc, money(total), note];
  });
  const head = paint(`Regional comparison · ${billing}`, "bold", s);
  return appendNotice(`${head}\n${table(rows, ["REGION ID", "LOCATION", "TOTAL USD", "COMPARISON"], s)}`, r, s);
}

function compileView(r: Row, s?: StreamLike): string {
  const resources: Row[] = Array.isArray(r.resources) ? r.resources.filter(isRow) : [];
  const head = status(
    "ok",
    `Compiled quote (v${String(r.version ?? "1")}) · Customer: ${String(r.customer ?? "-")} · Horizon: ${String(r.horizon ?? "1m")} · Hash: ${String(r.input_hash ?? "").slice(0, 12)}`,
    s,
  );
  if (!resources.length) return appendNotice(head, r, s);
  const rows = resources.map(res => {
    const reg = String(res.region ?? "");
    const loc = regionLocation(reg);
    const specOrNeeds = res.spec
      ? String(res.spec)
      : isRow(res.needs)
        ? Object.entries(res.needs).map(([k, v]) => `${k}=${String(v)}`).join(", ")
        : "-";
    return [
      String(res.id ?? ""),
      String(res.service ?? ""),
      reg,
      loc,
      String(res.billing ?? ""),
      String(res.quantity ?? 1),
      clip(specOrNeeds, 42),
    ];
  });
  return appendNotice(`${head}\n${table(rows, ["ID", "SERVICE", "REGION ID", "LOCATION", "BILLING", "QTY", "SPEC / NEEDS"], s)}`, r, s);
}

function exportView(r: Row, s?: StreamLike): string {
  const out = status(
    "ok",
    `Exported ${String(r.rows ?? 0)} environment quote${r.rows === 1 ? "" : "s"} to ${String(r.path ?? "quotes.xlsx")} (Total: ${money(r.total_usd)} USD)`,
    s,
  );
  const sheets = paint("  Sheets: Quotes · Decisions · Resources · Totals", "dim", s);
  return appendNotice(`${out}\n${sheets}`, r, s);
}

function readView(r: Row, s?: StreamLike): string {
  const items: Row[] = Array.isArray(r.items) ? r.items.filter(isRow) : [];
  const head = paint(`${String(r.name ?? "Unnamed list")} (${String(r.id ?? "")})`, "bold", s);
  const rows = items.map((item, idx) => {
    const reg = String(item.region ?? "-");
    const loc = reg !== "-" ? regionLocation(reg) : "-";
    const products: Row[] = Array.isArray(item.products) ? item.products.filter(isRow) : [];
    const specs = products
      .map(p => {
        const sp = String(p.spec ?? "");
        const qty = Number(p.num ?? 1) > 1 ? `*${String(p.num)}` : "";
        const sz = p.size != null && Number(p.size) > 0 ? `@${String(p.size)}` : "";
        return `${sp}${qty}${sz}`;
      })
      .filter(Boolean)
      .join(", ");
    return [
      clip(String(item.title ?? `card ${idx + 1}`), 28),
      String(item.service ?? "-"),
      reg,
      loc,
      String(item.mode ?? "-"),
      clip(specs || "-", 40),
      money(item.amount),
    ];
  });
  const total = paint(`TOTAL ${money(r.total)} USD`, "bold", s);
  return appendNotice([head, rows.length ? table(rows, ["CARD", "SERVICE", "REGION ID", "LOCATION", "MODE", "PRODUCTS", "AMOUNT USD"], s) : "No cards in list.", total].join("\n"), r, s);
}

function deleteView(r: Row, s?: StreamLike): string {
  return appendNotice(status("ok", `Deleted saved price list ${String(r.deleted ?? "")}`, s), r, s);
}

function renameView(r: Row, s?: StreamLike): string {
  return appendNotice(status("ok", `Renamed price list ${String(r.id)} to "${String(r.name)}"`, s), r, s);
}

function duplicateView(r: Row, s?: StreamLike): string {
  const label = r.name ? ` ("${String(r.name)}")` : "";
  const lines = [status("ok", `Duplicated price list -> ${String(r.id)}${label}`, s)];
  if (r.url) lines.push(`  ${String(r.url)}`);
  return appendNotice(lines.join("\n"), r, s);
}

function authStatusView(r: Row, s?: StreamLike): string {
  if (r.waiting) {
    return appendNotice(status("warn", String(r.hint ?? "Waiting for sign-in in the browser window..."), s), r, s);
  }
  if (!r.logged_in) {
    return appendNotice(
      status("warn", `Not signed in (profile ${String(r.profile ?? "default")}). ${String(r.hint ?? "Run 'autocalc login' to sign in.")}`, s),
      r,
      s,
    );
  }
  const isStale = typeof r.age_hours === "number" && r.age_hours > 24;
  const age = typeof r.age_hours === "number" ? `${r.age_hours.toFixed(1)} h${isStale ? " (may be expired; typical session is 24h)" : ""}` : "-";
  const head = status("ok", `Signed in (profile ${String(r.profile ?? "default")}${r.account_mask ? `, account ${String(r.account_mask)}` : ""})`, s);
  const details = kv([
    ["account", r.account_mask ?? "authenticated"],
    ["session age", age],
    ["cookies", r.cookies],
    ["backend", r.backend],
  ], s);
  return appendNotice(details ? `${head}\n${details}` : head, r, s);
}

function draftView(r: Row, s?: StreamLike): string {
  const reqs: Row[] = Array.isArray(r.requirements) ? r.requirements.filter(isRow) : [];
  const pending: string[] = Array.isArray(r.pending) ? r.pending.map(String) : [];
  const rows = reqs.map(req => {
    const dec = isRow(req.decision) ? req.decision : null;
    if (dec) {
      return [String(req.id ?? ""), String(req.service ?? ""), String(dec.spec ?? "-"), "decided", String(dec.reason ?? "")];
    }
    const cands: Row[] = Array.isArray(req.candidates) ? req.candidates.filter(isRow) : [];
    const top = cands.slice(0, 3).map(c => `${String(c.spec)} ($${String(c.price)})`).join(", ");
    return [String(req.id ?? ""), String(req.service ?? ""), "-", "pending", top ? `candidates: ${top}` : "no candidates"];
  });
  const summary = status(
    pending.length ? "warn" : "ok",
    `Draft ${String(r.draft_id)} · ${pending.length ? `${pending.length} pending requirement(s): ${pending.join(", ")}` : "all requirements decided; ready to publish"}`,
    s,
  );
  return appendNotice([rows.length ? table(rows, ["ID", "SERVICE", "CHOSEN SPEC", "STATUS", "DETAILS"], s) : "", summary].filter(Boolean).join("\n"), r, s);
}

function reviseView(r: Row, s?: StreamLike): string {
  const pending: string[] = Array.isArray(r.pending) ? r.pending.map(String) : [];
  return appendNotice(
    status(
      pending.length ? "warn" : "ok",
      `Updated draft ${String(r.draft_id)} · ${pending.length ? `${pending.length} still pending (${pending.join(", ")})` : "all requirements decided; ready to publish"}`,
      s,
    ),
    r,
    s,
  );
}

function listDraftsView(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow);
  if (!items.length) return "No local quote drafts.";
  const body = items.map(d => [
    String(d.id ?? d.draft_id ?? ""),
    String(d.customer ?? "-"),
    String(d.state ?? d.status ?? "-"),
    Array.isArray(d.pending) ? String(d.pending.length) : "-",
  ]);
  return `${table(body, ["DRAFT ID", "CUSTOMER", "STATE", "PENDING"], s)}\n${paint(`${items.length} draft${items.length === 1 ? "" : "s"}.`, "dim", s)}`;
}

function inspectDraftView(r: Row, s?: StreamLike): string {
  const head = paint(`Draft ${String(r.id ?? r.draft_id ?? "")}`, "bold", s);
  const body = kv([
    ["customer", r.customer],
    ["state", r.state ?? r.status],
    ["list id", r.list_id ?? r.remote_list_id],
    ["pending", Array.isArray(r.pending) ? (r.pending.length ? r.pending.join(", ") : "none") : undefined],
  ], s);
  return appendNotice([head, body].filter(Boolean).join("\n"), r, s);
}

function pageControlsView(rows: unknown[], s?: StreamLike): string {
  const items = rows.filter(isRow);
  if (!items.length) return "No page controls found.";
  const body = items.map(c => [
    String(c.id ?? ""),
    String(c.kind ?? ""),
    String(c.title ?? "-"),
    String(c.default ?? "-"),
  ]);
  return `${table(body, ["CONTROL ID", "KIND", "TITLE", "DEFAULT"], s)}\n${paint(`${items.length} controls.`, "dim", s)}`;
}

export function humanView(cmd: string, result: unknown, s?: StreamLike): string | null {
  if (Array.isArray(result)) {
    if (cmd === "lists" || cmd === "list-my-price-lists" || cmd === "list_my_price_lists") return lists(result, s);
    if (cmd === "search" || cmd === "search-skus" || cmd === "search_skus") return search(result, s);
    if (cmd === "services" || cmd === "list-services" || cmd === "list_services") return servicesView(result, s);
    if (cmd === "supported" || cmd === "supported-services" || cmd === "supported_services") return supportedView(result, s);
    if (cmd === "list-drafts" || cmd === "list_drafts") return listDraftsView(result, s);
    if (cmd === "page-controls") return pageControlsView(result, s);
    return null;
  }
  if (!isRow(result)) return null;
  if (cmd === "regions" || cmd === "list-regions" || cmd === "list_regions") return regionsView(result, s);
  if ((cmd === "describe" || cmd === "describe-service" || cmd === "describe_service") && typeof result.service === "string") return describeView(result, s);
  if (cmd === "validate" && "ok" in result && "items" in result) return validate(result, s);
  if (cmd === "edit-check" && Array.isArray(result.results)) return editCheck(result, s);
  if (cmd === "render-check" && "ok" in result) return renderCheckView(result, s);
  if (cmd === "doctor" && Array.isArray(result.checks)) return doctor(result, s);
  if (cmd === "quote" && Array.isArray(result.items)) return quote(result, s);
  if ((cmd === "convert" || cmd === "convert-currency" || cmd === "convert_currency") && "currency" in result) return convertView(result, s);
  if ((cmd === "compare-modes" || cmd === "compare_modes") && Array.isArray(result.modes)) return compareModesView(result, s);
  if ((cmd === "compare-regions" || cmd === "compare_regions") && Array.isArray(result.regions)) return compareRegionsView(result, s);
  if ((cmd === "compile" || cmd === "compile-quote" || cmd === "compile_quote") && Array.isArray(result.resources)) return compileView(result, s);
  if ((cmd === "export" || cmd === "export-quotes-xlsx" || cmd === "export_quotes_xlsx") && typeof result.path === "string") return exportView(result, s);
  if ((cmd === "read" || cmd === "read-price-list" || cmd === "read_price_list") && Array.isArray(result.items)) return readView(result, s);
  if ((cmd === "delete" || cmd === "delete-price-list" || cmd === "delete_price_list") && typeof result.deleted === "string") return deleteView(result, s);
  if ((cmd === "rename" || cmd === "rename-price-list" || cmd === "rename_price_list") && typeof result.id === "string" && typeof result.name === "string") return renameView(result, s);
  if ((cmd === "duplicate" || cmd === "duplicate-price-list" || cmd === "duplicate_price_list") && typeof result.id === "string") return duplicateView(result, s);
  if ((cmd === "login" || cmd === "auth-login" || cmd === "auth_login" || cmd === "auth status" || cmd === "auth-status" || cmd === "auth_status") && ("logged_in" in result || "waiting" in result)) return authStatusView(result, s);
  if ((cmd === "draft-quote" || cmd === "draft_quote") && Array.isArray(result.requirements)) return draftView(result, s);
  if ((cmd === "revise-quote" || cmd === "revise_quote") && typeof result.draft_id === "string" && Array.isArray(result.pending)) return reviseView(result, s);
  if ((cmd === "inspect-draft" || cmd === "inspect_draft" || cmd === "recover-draft" || cmd === "recover_draft") && (typeof result.id === "string" || typeof result.draft_id === "string")) return inspectDraftView(result, s);
  return null;
}
