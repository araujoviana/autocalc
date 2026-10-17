# Proposal

## Why

ADR-0007: agents combined the 17 fine-grained tools wrongly (publishing without a preview,
skipping availability checks) and humans cannot test the tools without an AI. The quote core
(`draft_quote`, `decide`, ranking, run records) and the publish gate exist but nothing exposes
them. This change joins them behind one tool registry that feeds both the MCP server and the CLI.

## What Changes

- New `src/autocalc/tools.py`: a registry (`@tool`) holding every tool function. The MCP server
  registers from it and the CLI builds one subcommand per tool from the function signature, so
  both expose the same behavior.
- Three workflow tools: `draft_quote` (requirements → ranked candidates, auto-confirmed exact
  matches, a draft id), `revise_quote` (record the human's decisions), `publish_quote` (build
  cards from the decisions and publish through the gate). A draft with an undecided requirement
  cannot be published.
- `create_price_list` is removed: the only way to a link is `publish_quote`. Quote/preview tools
  (`quote`, `compare_*`) stay as secondary tools.
- `Requirement` gains `options` (passed to the service builder: image, disks, bandwidth).
- The `quote_workflow` prompt describes the new path; the `mcp-surface` spec is rewritten.

### Out of scope

- Moving to `MCPServer`: the installed `mcp` (1.30, pinned `<2`) has no such class, so the row
  stays on the roadmap until the SDK ships it.
- Excel export, `list_runs`, `selftest`, auth tools beyond today's.
- `publish_quote` for services other than ECS and EVS: other builders keep their own option
  names; each joins the workflow with its migration. Other services fail with `VALIDATION`
  naming the supported ones.
- Hand-written CLI commands (`quote`, `services`, `regions`, `search`, `lists`) are kept; a
  generated command is skipped when a hand-written one owns the name.

### Publish-gate impact

None. `publish_quote` calls `gate.publish_checked`; there is no other path to a link.

## Capabilities

### Modified Capabilities

- `mcp-surface`: tool inventory, dry-run requirement and prompt replaced by the workflow.

## Impact

- Code: new `tools.py`; `server.py` shrinks to registration; `cli.py` registers generated
  subcommands; `core/model.py` (`options`); new `workflow.py` with the three tools.
- Breaking: `create_price_list` is gone.
- Docs: `docs/reference` tool list, `docs/roadmap.md`.
