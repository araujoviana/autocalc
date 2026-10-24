## Why

A quote ends up in a spreadsheet that the team keeps: one row per environment with the list's
name, its total and the link. Today that is copied by hand. A fixed layout also makes the sheets
comparable between customers.

## What Changes

- New tool `export_quotes_xlsx(rows, path)`: reads each saved or shared list (anonymous) and writes
  an `.xlsx` table with the columns Environment, Calculator, Total (USD), Link, and a total row.
- No new dependency: the workbook is written with the standard library.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-surface`: one more tool, in the list tools.

## Impact

`src/autocalc/xlsx.py` (new), `src/autocalc/tools.py`, docs (CLI reference, tutorial step).
