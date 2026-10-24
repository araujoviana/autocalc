## Why

The "Export lists to a spreadsheet" requirement still describes the first version of
`export_quotes_xlsx` (rows of `{env, list}`, one sheet). The tool now writes four sheets and a row
can also name a `draft_id`. The Resources sheet also puts backup-vault GB in its Storage column, which
no requirement says. The spec and the shipped behavior disagree.

## What Changes

- Reword the export requirement: rows are `{env, list, draft_id?}`, the workbook has the four sheets
  of "Fixed sheet layout", and the Quotes sheet has a header, one row per environment and a Total row.
- State in "Fixed sheet layout" that on the Resources sheet a backup line's size goes in the Storage
  (GB) column, while Totals keeps Backup (GB) separate.
- No code change: this records what is shipped.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-surface`: the wording of `export_quotes_xlsx` and its sheet layout.

## Impact

`openspec/specs/mcp-surface/spec.md` only.
