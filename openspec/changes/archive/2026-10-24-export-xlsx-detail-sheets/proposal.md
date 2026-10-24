## Why

The export shows the totals but not why anything was chosen, what each resource is, or how big
the whole thing is. Whoever opens the workbook later has to re-open every list to find out.

## What Changes

- The workbook gets three more sheets: Decisions (what was decided and why), Resources (one row
  per resource of every list) and Totals (instances, vCPUs, RAM, storage per environment).
- `publish_quote` remembers which draft produced which list, so the Decisions sheet fills itself;
  a row can also name a `draft_id`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-surface`: the sheets of `export_quotes_xlsx`.

## Impact

`src/autocalc/xlsx.py` (several sheets), `src/autocalc/summary.py` (new), `tools.py`, `workflow.py`,
`core/store.py`, docs.
