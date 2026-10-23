## Why

Recipe services take no ranked spec: `publish_quote` builds them from `options` and the page's
defaults. A user who decides spec X in `revise_quote` gets a card for something else, silently.
Mapping catalog specs onto each recipe's page values is per-service data (45 services, internal
control values such as `dataInfo_1_`), so it is deferred; the silent mismatch is not acceptable.

## What Changes

- `publish_quote` adds a warning for every recipe service whose draft decision names a spec:
  the spec was not applied, the card uses the given options and the page's defaults.

Out of scope: the spec-to-option mapping itself.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `mcp-surface`: `publish_quote` warns when a recipe service ignores the chosen spec.

## Impact

- `workflow.py` (`publish_quote`), tests, `docs/roadmap.md` (the mapping stays an open item).
