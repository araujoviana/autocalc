---
status: accepted
date: 2026-10-16
---

# Workflow surface: draft → revise → publish, from one tool registry

## Context and Problem Statement

The MCP server exposes 17 fine-grained tools. In real use, agents combined them wrongly:
they published without previewing, skipped availability checks, and mixed currencies. Humans
also need to test the tools without an AI in the loop.

## Considered Options

* Keep fine-grained tools and improve their descriptions.
* A workflow surface (`draft_quote` → `revise_quote` → `publish_quote`) plus secondary
  tools for discovery, list management, auth and run records.
* A separate interactive TUI/REPL for humans.

## Decision Outcome

Chosen option: **the workflow surface**, with the MCP tools *and* the CLI subcommands generated
from **one tool registry**, so both expose the same behavior. Humans test through the CLI or
the MCP Inspector. No TUI or REPL.

* `draft_quote`: requirements → ranked candidates and a priced draft (rating API only).
* `revise_quote`: apply the human's decisions to a draft.
* `publish_quote`: encode, save, run the gate (ADR-0003), and return the link; Excel only when
  asked.

### Consequences

* Good, because the safe path is the only path.
* Good, because CLI parity means every agent behavior can be reproduced by hand.
* Bad, because existing tool names change. The `mcp-surface` spec is rewritten in the change that
  ships this.
