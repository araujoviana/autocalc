# Design

## Context

`server.py` holds 17 `@mcp.tool()` functions; `cli.py` is hand-written. `core` has
`draft_quote`/`decide` over a `Provider`; `gate.publish_checked` publishes. Requirement has no
place for builder options and a decision stores only a spec code.

## Decisions

### D1. Registry is a dict filled by a decorator
`tools.tool(fn)` stores `fn` by name and returns it. `server.py` loops the registry and calls
`mcp.tool()(_tool_errors(fn))`; so tools stay plain functions and unit-testable. Errors become
`{"error",...}` payloads in MCP, and exit code 2 in the CLI (existing `_print_err`).

### D2. CLI arguments from the signature
Per parameter: `bool` → `--flag/--no-flag`-style `store_true` when default False; `int`/`float`/`str`
→ typed option; anything else (list, dict, unions) → a JSON string, `@file` reads a file. Required
parameters are required options. Subcommand name = tool name with `_` → `-`. Skipped if the name
is already taken by a hand-written command.

### D3. Workflow lives in `workflow.py`, tools are thin
`draft_quote(customer, requirements)`: build `Requirement`s from dicts, `core.draft_quote` with
`HuaweiProvider`, return `{draft_id, requirements: [{id, decided, candidates (top 5 with reason)}]}`.
`revise_quote(draft_id, decisions)`: `core.decide` for each. `publish_quote(draft_id, name,
settlement, currency)`: refuse if `draft.pending()`; per requirement call the service builder with
`region`, `billing`, `quantity`, `**options` and the decided spec under the builder's spec
argument (`_SPEC_ARG`: ecs→`flavor`, evs→`type`); then `gate.publish_checked`. Other services
raise `ValidationError(field="service", allowed=...)` before anything is built.

### D4. `options` on Requirement
A dict passed through to the builder. Default empty, so stored v1 drafts still load.
