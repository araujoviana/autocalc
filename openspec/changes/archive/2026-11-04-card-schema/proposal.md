# Proposal

## Why

What a service's card accepts is spread across hand-written Python (`Recipe` dicts, 22 builders'
`options()`), the live page, and the agent's head. Nobody can see which of a page's controls are
mapped, and an agent that wants a legal option value must read the source and write its own
scripts, because the MCP only lists option *names*. A quote is also ephemeral: a draft in a
local store, not a reviewable file.

The page already is the encoder (ADR-0001), so the page can also be the **source of the schema**.
A schema generated from the page, committed as data, plus declarative card files validated
against it, gives a Terraform-like loop: write the quote as a file, `plan` it, `apply` it.

## What Changes

- Add a **per-service card schema** in YAML, generated from the calculator page (controls, kinds,
  ordering dependencies, ranges, option values where they are static), committed to the repo and
  versioned by the page's frontend version. Hand-written fields are limited to the human option
  name and notes.
- Add **card files**: YAML resources (`type: ecs`, options, quantity, billing) validated against
  the schema, grouped in a quote file with defaults (customer, region, billing).
- Add **`plan` and `apply`** on those files. `plan` validates, resolves requirements through the
  existing ranking, rates, and reports price, unmapped options and drift, with no side effects
  on the website. `apply` publishes through the existing gate. Both sit on the existing
  draft/ranking/gate engine; `draft_quote`, `revise_quote` and `publish_quote` are unchanged.
- Add a **lock file** that pins resolved SKUs so a re-plan does not silently change a quote.
- Add a **coverage report**: controls on the page versus controls the schema maps, per service.
- Add **schema drift detection**: re-pull and diff against the committed schema.
- MCP: expose schemas as **resources**, make validation errors list the **legal values**, and add
  `plan_quote` / `apply_quote` tools.
- Make the schema format **language-neutral** so the Python and the TypeScript implementations
  read the same files (the later `ts-parity` change is rebased on it).

Out of scope: removing the existing workflow tools or the Python builders; a state design for
updating a published list in place (spike only, see design); AWS; cross-card references or
expressions; HCL syntax; a registry or sharing of schemas outside this repo.

Publish-gate impact: none. `apply` calls the existing gate (ADR-0003) and its request-fidelity
rule (ADR-0016); a schema that validates a request never replaces the Edit check.

## Capabilities

### New Capabilities

- `huawei/card-schema`: the generated per-service schema, how it is pulled, what it records, and
  how coverage and drift are reported.
- `core/quote-files`: the declarative quote file (cards, defaults), validation, `plan`, `apply`
  and the lock file.

### Modified Capabilities

- `mcp-surface`: the tool inventory gains `plan_quote` and `apply_quote`; schemas are available as
  resources; validation errors for card options name the legal values.

## Impact

- Code: new schema generator reusing `page/` controls listing; new `core/` quote-file model; new
  tools registered in `tools.py`; `server.py` resources; `cli.py` `schema`, `plan`, `apply`
  commands. No change to the gate or the rating path.
- Data: new committed `schema/*.yaml` (one per verified service); user quote files and lock
  files live outside the repo or in a user directory (no client data in the repo).
- Docs: new ADR (declarative quotes), `docs/reference` pages for the schema and the quote file.
- `ts-parity`: its page and builder tasks shrink to porting the schema-driven replay; it keeps
  the rest. Updated after this change lands.
