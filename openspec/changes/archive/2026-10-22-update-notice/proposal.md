## Why

ADR-0013 promises an update notice in tool results at most once a day, with no silent update.
`autocalc update` exists but nothing tells the user a newer release is out.

## What Changes

- Dict-shaped tool results (MCP and CLI) carry `update_notice` when a newer `vX.Y.Z` tag exists.
- The tag lookup runs at most once a day (stamp in the config dir), never raises, never updates.
- `AUTOCALC_NO_UPDATE_CHECK=1` turns it off.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `distribution`: update notice.

## Impact

- `update.py` (`notice`, `with_notice`), `server.py`, `cli.py`, tests, `docs/roadmap.md`, `docs/reference/cli.md`.
