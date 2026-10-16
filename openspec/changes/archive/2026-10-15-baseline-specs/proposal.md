# Proposal

## Why

autocalc works (700/734 corpus cards round-trip to the cent), but its contract with the
reverse-engineered Huawei Cloud calculator lives in prose: `docs/CAVEATS.md`,
`docs/BACKLOG.md` and the README. Agents and humans re-learn these rules by breaking cards.
Before we refactor and make the MCP surface easier for agents, we need one checked
source of truth for current behavior that later changes can modify as deltas.

## What Changes

- Add baseline OpenSpec specs that describe autocalc's **current** externally visible behavior
  and every known calculator caveat as testable requirements with scenarios.
- Map each scenario to the test that covers it, or mark it uncovered, so gaps are visible.
- Record where the code currently diverges from an established rule (for example, the ECS
  builder's default 5 Mbit/s EIP), without fixing it here. The fixes belong to a follow-up
  `repo-hygiene` change.
- Point `docs/CAVEATS.md` at the specs as the authoritative contract and keep it as a short
  explanation of *why* each rule exists.
- No source code changes, no behavior changes.

## Capabilities

### New Capabilities

- `catalog-access`: anonymous reads of the calculator's catalog (service menu, regions,
  per-region product info, label packs, service config bundles, exchange rates), caching and
  CDN fallback, plus SKU search.
- `rating`: pricing resources with the calculator's live rating engine (`inquiry`): billing-mode
  mapping, on-demand usage factors, scaling to hours/periods, and typed upstream errors.
- `card-building`: turning high-level service options into a saved-list card the website
  renders and edits correctly: the card shape, render-template rules, label-token rule,
  per-service pricing models (RI, DMS conversion rates, OBS packages, one card per unit), and
  golden-corpus fidelity.
- `saved-lists-and-auth`: one-time browser login, session storage and silent refresh, the
  share-list lifecycle (create, list, read anonymously, rename, duplicate, delete), share links,
  and saved-list validation.
- `region-availability`: friendly region resolution, ambiguity handling, and checks for
  service, billing mode and spec availability, with actionable alternatives.
- `mcp-surface`: the agent-facing MCP tools and prompt: which tools exist, which need auth,
  dry-run-before-publish, structured errors, and the quote workflow.

### Modified Capabilities

None. `openspec/specs/` is empty; this change creates the baseline.

## Impact

- New files only: `openspec/specs/**` (after archive), plus edits to `docs/CAVEATS.md` and the
  README to point at the specs.
- No change to `src/`, the MCP tool signatures, the CLI or dependencies.
- Follow-up changes (`repo-hygiene`, `bundle-token-mining`, agent-UX work) will be written as
  deltas against these specs.
