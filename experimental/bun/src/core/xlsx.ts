/** A small .xlsx writer (standard library only): sheets of text, numbers and hyperlinks (mirrors `src/autocalc/xlsx.py` and `tools.py:export_quotes_xlsx`). */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { shareLink } from "./endpoints.ts";
import { CalculatorError } from "./errors.ts";
import { shareDetail } from "./lists.ts";
import { roundPython } from "./rounding.ts";
import { ListReference } from "./schemas.ts";
import * as summary from "./summary.ts";
import type { ActionContext } from "./types.ts";

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>
<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export class Link {
  constructor(readonly url: string) {}
}

export class Money {
  constructor(readonly value: number) {}
}

export class Sum {
  constructor(
    readonly first: number,
    readonly last: number,
    readonly value: number,
    readonly money = false,
  ) {}
}

export class Sheet {
  constructor(
    readonly name: string,
    readonly header: string[],
    readonly rows: unknown[][],
    readonly widths: number[],
    readonly total_row: unknown[] | null = null,
    readonly notes: string[] = [],
  ) {}
}

function escapeXml(s: string, quote = false): string {
  let out = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (quote) out = out.replace(/"/g, "&quot;");
  return out;
}

export function _column(index: number): string {
  let n = index;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    n = Math.trunc((n - 1) / 26);
    result = String.fromCharCode(65 + rem) + result;
  }
  return result;
}

export function _cell(ref: string, value: unknown, style: number): string {
  const numeric = value instanceof Money || value instanceof Sum ? value.value : value;
  if (typeof numeric === "number" && !Number.isFinite(numeric)) {
    throw new Error("Spreadsheet numbers must be finite.");
  }
  if (value instanceof Link) {
    const u = escapeXml(value.url, true);
    return `<c r="${ref}" s="2" t="str"><f>HYPERLINK("${u}","{u}")</f><v>${escapeXml(value.url)}</v></c>`.replace(
      '"{u}"',
      `"${u}"`,
    );
  }
  if (value instanceof Sum) {
    const col = ref.replace(/\d+$/, "");
    return `<c r="${ref}" s="${value.money ? 5 : 7}"><f>SUM(${col}${value.first}:${col}${value.last})</f><v>${value.value}</v></c>`;
  }
  if (value instanceof Money) {
    return `<c r="${ref}" s="3"><v>${value.value}</v></c>`;
  }
  if (typeof value === "number") {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

export function _sheet_xml(sh: Sheet): string {
  const body: unknown[][] = [sh.header, ...sh.rows, ...(sh.total_row ? [sh.total_row] : [])];
  const xml: string[] = [];
  body.forEach((row, idx) => {
    const n = idx + 1;
    const style = n === 1 ? 1 : sh.total_row && n === body.length ? 4 : 6;
    const cells = row
      .map((v, i) => (v !== null && v !== undefined ? _cell(`${_column(i + 1)}${n}`, v, style) : ""))
      .join("");
    xml.push(`<row r="${n}">${cells}</row>`);
  });
  sh.notes.forEach((note, k) => {
    const n = body.length + 2 + k;
    xml.push(`<row r="${n}">${_cell(`A${n}`, note, 0)}</row>`);
  });
  const cols = sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return (
    `${HEAD}<worksheet ${NS}><sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${xml.join("")}</sheetData></worksheet>`
  );
}

function buildZip(parts: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(parts);
  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const rawBytes = encoder.encode(content);
    const compBytes = new Uint8Array(deflateRawSync(rawBytes));
    const crc = Bun.hash.crc32(rawBytes) >>> 0;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 8, true); // deflate
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x2100, true); // 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compBytes.length, true);
    lv.setUint32(22, rawBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x2100, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compBytes.length, true);
    cv.setUint32(24, rawBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, compBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + compBytes.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of [...localParts, ...centralParts, eocd]) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Read a zip archive written by `buildZip` (for unit tests without external tools). */
export function readZipEntries(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries: Record<string, string> = {};
  let pos = 0;
  while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const method = view.getUint16(pos + 8, true);
    const compSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = decoder.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const dataStart = pos + 30 + nameLen + extraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    const raw = method === 8 ? new Uint8Array(inflateRawSync(comp)) : comp;
    entries[name] = decoder.decode(raw);
    pos = dataStart + compSize;
  }
  return entries;
}

export function writeWorkbook(path: string, sheets: Sheet[]): void {
  if (existsSync(path)) {
    throw Object.assign(new Error(`Refusing to overwrite existing workbook: ${path}`), { code: "EEXIST" });
  }
  const ids = sheets.map((_, i) => i + 1);
  const parts: Record<string, string> = {
    "[Content_Types].xml":
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      ids
        .map(
          i =>
            `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
    "_rels/.rels":
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `${HEAD}<workbook ${NS} xmlns:r="${REL}"><sheets>` +
      sheets.map((sh, idx) => `<sheet name="${escapeXml(sh.name, true)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`).join("") +
      "</sheets></workbook>",
    "xl/_rels/workbook.xml.rels":
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      ids.map(i => `<Relationship Id="rId${i}" Type="${REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": STYLES,
  };
  sheets.forEach((sh, idx) => {
    parts[`xl/worksheets/sheet${idx + 1}.xml`] = _sheet_xml(sh);
  });
  const tmp = path.replace(/\.[^./\\]+$/, ".tmp");
  writeFileSync(tmp, buildZip(parts));
  renameSync(tmp, path);
}

export async function exportQuotesXlsx(
  ctx: ActionContext,
  input: { rows: Array<{ env?: string | undefined; list?: string | undefined; draft_id?: string | undefined }>; path?: string | null | undefined },
) {
  const outPath =
    input.path ?? join(ctx.drafts.root, "exports", `quotes-${randomBytes(6).toString("hex")}.xlsx`);
  if (existsSync(outPath)) {
    throw new CalculatorError("VALIDATION", "Export path already exists; choose a new filename.", undefined, {
      field: "path",
    });
  }
  if (!outPath.toLowerCase().endsWith(".xlsx")) {
    throw new CalculatorError("VALIDATION", "path must end in .xlsx.", undefined, { field: "path" });
  }
  if (!input.rows.length) {
    throw new CalculatorError("VALIDATION", "rows is empty.", undefined, { field: "rows" });
  }
  const quotes: unknown[][] = [];
  const decisions: unknown[][] = [];
  const resources: unknown[][] = [];
  const totals: unknown[][] = [];

  for (const r of input.rows) {
    const env = r.env;
    let lid: string;
    let detail: Record<string, any>;
    let draft: Awaited<ReturnType<typeof ctx.drafts.load>> | null = null;
    try {
      if (!r.list) throw new CalculatorError("VALIDATION", "Missing list reference");
      const parsed = ListReference.safeParse(r.list);
      if (!parsed.success) throw new CalculatorError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid share ID");
      lid = parsed.data;
      detail = (await shareDetail(ctx.reader, lid)) as Record<string, any>;
      const draftId = r.draft_id || (await ctx.drafts.draftFor(lid));
      draft = draftId ? await ctx.drafts.load(draftId) : null;
    } catch (err: any) {
      throw new CalculatorError(
        "VALIDATION",
        `Cannot read the list or draft for ${JSON.stringify(env)}: ${err?.message ?? String(err)}`,
        undefined,
        { field: "list" },
      );
    }
    const lines = summary.resources(detail);
    quotes.push([env, detail.name || "", new Money(summary.total(detail)), new Link(shareLink(lid, "USD"))]);
    if (draft) {
      const byReq = new Map(draft.decisions.map(d => [d.requirement_id, d]));
      for (const q of draft.requirements) {
        const d = byReq.get(q.id);
        decisions.push([
          env,
          q.id,
          q.service,
          q.region,
          q.billing,
          q.quantity,
          d ? d.spec : "(undecided)",
          d ? d.by : "",
          d ? d.justification : "",
        ]);
      }
    } else {
      decisions.push([env, "(no draft is recorded for this list)", null, null, null, null, null, null, null]);
    }
    for (const x of lines) {
      resources.push([
        env,
        detail.name || "",
        x.service,
        x.region,
        x.billing,
        x.resource,
        x.spec,
        x.quantity,
        x.storage_gb || x.backup_gb,
        roundPython(x.vcpus, 2),
        roundPython(x.ram_gb, 2),
        new Money(x.price),
      ]);
    }
    const t = summary.totals(lines);
    totals.push([
      env,
      t.instances,
      roundPython(t.vcpus, 2),
      roundPython(t.ram_gb, 2),
      t.storage_gb,
      t.backup_gb,
      new Money(summary.total(detail)),
    ]);
  }

  const n = input.rows.length + 1;
  const grand = roundPython(
    quotes.reduce((acc, q) => acc + (q[2] as Money).value, 0),
    2,
  );
  const colSums = [1, 2, 3, 4, 5].map(colIdx =>
    new Sum(
      2,
      n,
      totals.reduce((acc, row) => acc + Number(row[colIdx] ?? 0), 0),
    ),
  );
  const sums = [...colSums, new Sum(2, n, grand, true)];
  mkdirSync(dirname(outPath), { recursive: true });
  writeWorkbook(outPath, [
    new Sheet(
      "Quotes",
      ["Environment", "Calculator", "Total (USD)", "Link"],
      quotes,
      [16, 40, 14, 60],
      ["Total", null, new Sum(2, n, grand, true), null],
    ),
    new Sheet(
      "Decisions",
      ["Environment", "Requirement", "Service", "Region", "Billing", "Quantity", "Chosen spec", "Decided by", "Justification"],
      decisions,
      [16, 16, 12, 16, 12, 10, 28, 12, 70],
    ),
    new Sheet(
      "Resources",
      [
        "Environment",
        "Calculator",
        "Service",
        "Region",
        "Billing",
        "Resource",
        "Spec",
        "Quantity",
        "Storage (GB)",
        "vCPUs",
        "RAM (GB)",
        "Price (USD)",
      ],
      resources,
      [16, 30, 12, 16, 12, 16, 30, 10, 14, 10, 10, 14],
    ),
    new Sheet(
      "Totals",
      ["Environment", "Instances", "vCPUs", "RAM (GB)", "Storage (GB)", "Backup (GB)", "Total (USD)"],
      totals,
      [16, 12, 10, 10, 14, 14, 14],
      ["Total", ...sums],
      [
        "Instances, vCPUs and RAM count virtual machines and database instances.",
        "Storage counts disks, database volumes, message-queue storage and SFS Turbo; Backup counts backup vaults.",
        "Not counted: bandwidth, containers and usage-billed services (OBS, functions, logs).",
      ],
    ),
  ]);
  return { path: resolve(outPath), rows: input.rows.length, total_usd: grand };
}
