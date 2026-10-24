## Why

Three gaps in the MCP surface: `auth_login` blocks for up to 5 minutes, which many MCP clients
time out on; `draft_quote` options are free-form, so a typo is found only at publish, after the
user agreed to the quote; and `list_regions` mixes listing with resolving one name.

## What Changes

- `auth_login` waits up to `wait_seconds` (default 45). If the user has not finished, it returns
  `waiting` while the sign-in carries on in the background; `auth_status` then reports the result.
- `supported_services` lists each service's `options`, and `draft_quote` rejects an unknown option
  with the allowed names.
- `list_regions` loses its `region` argument. Every other tool already resolves friendly names.
- **BREAKING** for clients that call `list_regions(region=...)`; the long blocking login also changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-surface`: auth login timing, option discovery and validation, region listing.

## Impact

`src/autocalc/tools.py`, `workflow.py`, `services/__init__.py`, `services/base.py`, `services/forms.py`.
