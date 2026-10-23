## Why

An end-to-end run of the installed MCP server (draft, revise, publish, delete) failed three ways:
the gate's browser could not run inside the server's event loop, the default ECS pick was a
flavor the page cannot select (T7 has no family control) or a BYOL image the builder could not
find. `publish_quote` could not complete over MCP at all.

## What Changes

- MCP tools run in a worker thread, so tools that drive a browser work.
- ECS candidates are limited to the OS of the requested image (`.linux`, or `.win` for a Windows
  image), so BYOL variants are not auto-picked.
- ECS flavors that the calculator page does not list (no `vmType` in the catalog) are not offered
  as candidates; they stay visible in `search`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `mcp-surface`: tools that drive a browser run off the event loop.

## Impact

- `server.py`, `providers/huawei.py`, `client.py` (`Sku.off_page`), tests, version 0.1.1.
