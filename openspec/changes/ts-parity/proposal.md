# Proposal

## Why

ADR-0017 (proposed) makes TypeScript on Bun the target implementation, because the product is
web automation and Playwright is best supported in TypeScript. A TypeScript tree exists on
`origin/bun-migration-review` (`experimental/bun/`), but it was cut from an earlier Python
revision and lacks the draft → revise → publish workflow, the page-encoder publish gate and
the provider-neutral core. Until it reaches parity, Python (ADR-0016) is the only
implementation that can deliver a verified share link. This change defines what "parity"
means and the order of work to reach it, so Python can be removed without losing behavior.

## What Changes

- Bring `experimental/bun/` onto current `main` and port, in order: the provider-neutral core
  (model, ranking, draft store, run records), the draft/revise/publish workflow tools, the
  form-only page replay with the fail-closed publish gate, and the remaining tools
  (`export_quotes_xlsx`, update notice and `update`, `doctor`).
- Add a parity gate: the two implementations expose the same MCP tool names and input
  schemas, and the same offline suite scenarios and golden-corpus checks pass on both.
- Decide distribution for the TypeScript tool (ADR-0019), replacing ADR-0013's `uv tool` path.
- Cut over: move the TypeScript tree to the repository root, remove Python, update CI,
  installers and docs.
- **BREAKING** (at cutover only): `uv tool install` and `autocalc update` stop working for
  existing installs; users reinstall once. Drafts and the browser session are kept readable
  (see design).

Out of scope: new services beyond the 50 verified, AWS (v2), changing pricing or gate
behavior, the `FastMCP` → `MCPServer` migration, and rewriting the page interaction layer to be
less fragile (that is the reason for the move, and gets its own change after cutover).

Publish-gate impact: none. The gate (ADR-0003) and request fidelity (ADR-0016) must behave
identically in TypeScript; the parity gate is what proves it. A gate check that cannot be
ported unchanged blocks cutover instead of being weakened.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-quality`: adds the rule that an implementation is removed only after its replacement
  passes the parity gate. The Python-specific requirements (pytest markers, ruff, `sys.path`)
  are reworded or removed in the cutover phase, together with the code that makes them true.

`distribution` is also modified, but its delta is written when ADR-0019 is accepted, because
the replacement install path is undecided and undecided targets belong in ADRs, not specs.

## Impact

- Code: `experimental/bun/` (grows to full parity), then repository root layout, `src/autocalc/`
  (removed at cutover), `tests/`, `pyproject.toml`, `uv.lock`, `install.sh`, `install.ps1`,
  `.github/workflows/`.
- Docs: ADR-0017 accepted, ADR-0013 superseded by ADR-0019, ADR index, README, CONTRIBUTING,
  `docs/how-to/*` that name `uv`/`pytest`/`ruff`.
- Dependencies: Bun 1.4.4, Playwright (TS), MCP TypeScript SDK, zod, commander. Python
  dependencies are dropped at cutover.
- Coexists with the in-flight `research-knowledge-and-mcp-workflow` change, which documents
  the current workflow and does not touch runtime code.
