"""A small .xlsx writer (standard library only): sheets of text, numbers and hyperlinks."""

from __future__ import annotations

import math
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape

# cell styles: 0 plain, 1 bold header, 2 wrapped link, 3 money (two decimals), 4 bold label, 5 bold money, 6 wrapped text, 7 bold count
STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</styleSheet>"""

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'


@dataclass
class Link:
    url: str


@dataclass
class Money:
    """A USD amount: shown with two decimals."""
    value: float


@dataclass
class Sum:
    """A SUM over rows ``first``..``last`` of the cell's own column, with its value cached."""
    first: int
    last: int
    value: float
    money: bool = False


@dataclass
class Sheet:
    name: str
    header: list[str]
    rows: list[list]
    widths: list[int]
    total_row: list | None = None  # bold, last
    notes: list[str] = field(default_factory=list)  # plain lines under the table, after a blank row


def _column(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _cell(ref: str, value, style: int) -> str:
    numeric = value.value if isinstance(value, (Money, Sum)) else value
    if isinstance(numeric, (int, float)) and not math.isfinite(numeric):
        raise ValueError("Spreadsheet numbers must be finite.")
    if isinstance(value, Link):
        u = escape(value.url, {'"': "&quot;"})
        return f'<c r="{ref}" s="2" t="str"><f>HYPERLINK("{u}","{u}")</f><v>{escape(value.url)}</v></c>'
    if isinstance(value, Sum):
        col = ref.rstrip("0123456789")
        return f'<c r="{ref}" s="{5 if value.money else 7}"><f>SUM({col}{value.first}:{col}{value.last})</f><v>{value.value}</v></c>'
    if isinstance(value, Money):
        return f'<c r="{ref}" s="3"><v>{value.value}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>'


def _sheet_xml(sh: Sheet) -> str:
    body = [sh.header, *sh.rows, *([sh.total_row] if sh.total_row else [])]
    xml = []
    for n, row in enumerate(body, 1):
        style = 1 if n == 1 else 4 if sh.total_row and n == len(body) else 6
        cells = "".join(_cell(f"{_column(i + 1)}{n}", v, style) for i, v in enumerate(row) if v is not None)
        xml.append(f'<row r="{n}">{cells}</row>')
    for k, note in enumerate(sh.notes):
        n = len(body) + 2 + k
        xml.append(f'<row r="{n}">{_cell(f"A{n}", note, 0)}</row>')
    cols = "".join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i, w in enumerate(sh.widths, 1))
    return (f'{HEAD}<worksheet {NS}><sheetViews><sheetView workbookViewId="0">'
            '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<cols>{cols}</cols><sheetData>{"".join(xml)}</sheetData></worksheet>')


def write_workbook(path: str | Path, sheets: list[Sheet]) -> None:
    """Write ``sheets`` (each: bold frozen header, rows, optional bold total row) to ``path``."""
    ids = range(1, len(sheets) + 1)
    parts = {
        "[Content_Types].xml": f'{HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in ids)
        + "</Types>",
        "_rels/.rels": f'{HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": f'{HEAD}<workbook {NS} xmlns:r="{REL}"><sheets>'
        + "".join(f'<sheet name="{escape(sh.name)}" sheetId="{i}" r:id="rId{i}"/>' for i, sh in zip(ids, sheets, strict=True))
        + "</sheets></workbook>",
        "xl/_rels/workbook.xml.rels": f'{HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(f'<Relationship Id="rId{i}" Type="{REL}/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in ids)
        + f'<Relationship Id="rId{len(sheets) + 1}" Type="{REL}/styles" Target="styles.xml"/></Relationships>',
        "xl/styles.xml": STYLES,
        **{f"xl/worksheets/sheet{i}.xml": _sheet_xml(sh) for i, sh in zip(ids, sheets, strict=True)},
    }
    path = Path(path)
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite existing workbook: {path}")
    tmp = path.with_suffix(".tmp")  # nothing at `path` unless the whole file was written
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)
    tmp.replace(path)
