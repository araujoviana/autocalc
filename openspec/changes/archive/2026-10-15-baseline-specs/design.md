# Design

## Context

See proposal.md for the motivation. Knowledge of how the calculator behaves is currently spread
across `docs/CAVEATS.md` (rules), `docs/BACKLOG.md` (plans and status, dated 2026-10-13), the
README (API notes, coverage numbers) and the code. The specs in this change were written from
the code first and the docs second. Where the two disagree, the rule from the docs (learned from
real Edit/NaN bugs) was kept as the requirement and the code gap is listed below.

## Goals / Non-Goals

**Goals:**
- One authoritative, testable contract per capability that later changes modify through deltas.
- A visible list of where the code does not yet meet that contract.

**Non-Goals:**
- Fixing the divergences (follow-up change `repo-hygiene`; the ECS EIP default was hot-fixed
  separately because it affected live quotes).
- Specifying the CLI flags one by one. The MCP surface is the primary interface. CLI behavior is
  covered through the shared capabilities.
- Specifying services not yet built (`eip`, `vpn`, `sfs` NAS, `dds`, …).

## Decisions

**1. Six capabilities split by the calculator's own seams.** catalog (anonymous GETs), rating
(the inquiry POST), card-building (the saved-list JSON contract), saved-lists-and-auth (the
session-gated `share/*` endpoints), region-availability (cross-cutting validation) and
mcp-surface (the agent contract). Alternative considered: one spec per service (ecs, obs, …).
Rejected because most rules (Edit price, tokens, RI aggregates) span services, and per-service
specs would duplicate them. Per-service quirks live as requirements in card-building.

**2. Baseline states the intended contract, not today's bugs.** A spec that encoded "ELB ignores
quantity" would make the bug the contract. Each requirement the code does not meet is listed
under Known divergences so it is not mistaken for implemented behavior.

**3. CAVEATS.md stays, but as rationale.** The specs say *what* must hold. CAVEATS keeps the
war stories (the 10480.39 vs 9831.28 Edit bug, the OBS phantom SKU) that explain *why*. Each
CAVEATS section gets a pointer to its requirement. BACKLOG.md is left untouched here. Its
status tables are superseded by specs and future changes in `repo-hygiene`.

**4. Coverage is tracked per capability, not per scenario, for now.** Tagging every test with
its scenario is a code change, out of scope for a docs-only change. Current coverage:

| Capability | Covered by | Gaps |
|---|---|---|
| catalog-access | `test_live` (services, availability) | cache, CDN fallback, token resolution, currency |
| rating | `test_live::test_quote_monthly`, `test_regions_errors::test_exception_mapping` | duration scaling, usage-value error, compare_* |
| card-building | golden suite, `test_template_render`, `test_ecs_defaults` | one-card-per-unit, OBS package SKUs, list totals/settlement |
| saved-lists-and-auth | `test_cli_auth` (curl parse, redaction, migration) | lifecycle (needs a session), validate rules |
| region-availability | `test_regions_errors` | service/mode/spec checks (no unit tests) |
| mcp-surface | none | all |

## Known divergences (code vs. spec)

| # | Requirement | Current behavior | Severity |
|---|---|---|---|
| D1 | card-building: No implicit public IP on ECS | `build` defaulted `bandwidth_mbit=5` and forwarded it to RI | **Fixed** in `99fa96d` |
| D2 | card-building: One card per unit | `ElbBuilder.build(quantity=N)` silently builds 1 LB; APIG stores `productNum=N` with no stepper | **High**: under-quotes |
| D3 | mcp-surface: Errors are structured | `_tool_errors` exists but no tool uses it; errors surface as exception text | Medium |
| D4 | mcp-surface: Friendly regions in every tool | `create_price_list` passes item `region` to builders unresolved; `region="Santiago"` fails with a misleading `CBC.6006: Can not find product GPSSD` | Medium |
| D5 | region-availability: service sold / mode offered | Availability checks run only in `describe_service`, not before building | Medium |
| D6 | region-availability: closest specs | Builders raise `SPEC_NOT_FOUND` with "run search_skus" instead of the 5 closest specs | Low |
| D7 | mcp-surface: Dry run (warnings) | `warnings` is always empty (e.g. FunctionGraph compute = 0 is not flagged) | Low |
| D8 | card-building: corpus fidelity | Golden ECS: 59/116 non-RI; RI test aborts on a delisted image instead of counting drift; README still says 109/111 | Medium (test honesty) |
| D9 | (input handling) | Dict-form disks `{"type","size"}` crash ECS (`'type' not sold`); only pairs work | Medium |

Also outside the specs: the dead legacy `ListBuilder`/`publish()` in `share.py`, and
`pytest -q` running live network tests despite the README saying otherwise.

## Live spot-check (2026-10-15)

Checked against the live endpoints while applying this change:

- Region resolution, SKU search order, monthly quote, RI (amount = perAmount × 12), FunctionGraph
  (10M requests → usageValue 10; compute line 0.00), OBS Santiago package (storage SKU only),
  unknown-service `VALIDATION` and ECS data-disk render entries all match the specs.
- A 5 Mbit/s EIP (`19_bgp`) costs USD 45.00/month in `sa-brazil-1` (40.08 in `la-south-2`),
  450.00/year, 102.57 for 730 h on-demand. The "~3.69" figure previously in CAVEATS was wrong.
- ELB `quantity=3` and `quantity=1` both price 38.69 (confirms D2).
- Anonymous `share/detail` returned `rewriteValue` for all 889 cards of the 37 readable corpus
  lists, so published templates are retrievable headlessly. A report that it comes back `null`
  was not reproduced. If seen, record the list id and investigate it as a separate issue.

## Risks / Trade-offs

- [Specs drift from code again] → Every later change must ship a delta; `openspec validate`
  runs before archive.
- [Requirements encode guesses about Huawei's API] → Each requirement here was observed against
  live endpoints or the corpus (see CAVEATS and git history). New ones need the same evidence.
- [Divergence list goes stale] → It is the input for `repo-hygiene`, which removes each row it
  fixes.
