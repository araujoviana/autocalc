## Why

`search_skus` is the most expensive tool result (about 4,200 tokens for 30 ECS rows) because each
row repeats the service and group and carries three nested price blocks. `compare_regions` calls
its billing argument `mode` while `quote` calls it `billing`, so agents guess wrong.

## What Changes

- `search_skus` rows become flat: `spec`, `description` without calculator housekeeping fields,
  and one number per billing mode. The CLI `search` command and the catalog client are unchanged.
- `compare_regions` takes `billing` instead of `mode` and returns `billing` in its result.
- **BREAKING** for MCP clients that pass `mode` to `compare_regions` or read nested `prices`
  from `search_skus`. Nothing has shipped to other users yet.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-surface`: result shape of `search_skus` and the argument name of `compare_regions`.

## Impact

`src/autocalc/tools.py`, `docs/adr/0008-mcp-output-format.md` (records what was done), one test.
