# Tasks

## 1. Decision record

- [x] 1.1 Write the ADR "Declarative quotes: generated card schema, plan/apply" (next free number) citing ADR-0001, 0003, 0007, 0016. Verify: it appears in `docs/adr/index.md` with `status: proposed`.

## 2. Schema generation (`huawei/card-schema`)

- [x] 2.1 Define the schema file format and a JSON Schema for it. Verify: a hand-written valid example passes and an invalid one fails in a unit test.
- [x] 2.2 Generator for ECS: from the page's controls (reuse the `page-controls` listing) emit controls, kinds, `after` (form order, `source: order`), titles, defaults, ranges (with optional `when`), with hand-written fields kept separate. Verify: running it twice on a recorded page fixture gives identical output; hand-edited notes survive a regeneration.
- [x] 2.3 Record the frontend version in each schema. Verify: the file names `CBC-PortalCalculator/<version>` and `autocalc doctor` reports a mismatch against the live page.
- [x] 2.4 Coverage report (`autocalc schema coverage <service>`). Verify: against the ECS fixture it lists mapped, unmapped and unsupported controls with a mapped percentage.
- [x] 2.5 Drift report (`autocalc schema diff <service>`): added, removed and changed controls; does not write. Verify: a fixture with one added control is reported and the committed file is unchanged.
- [x] 2.6 Extend generation to ECS and the 30 recipe services. Verify: each has a schema and no recipe-service control is left neither mapped nor marked `unsupported` (`test_schema_invariants.py`). Builder services are pulled (structure only); mapping their options moves to a follow-up change (see Follow-up).

## 3. Reconcile with existing definitions

- [x] 3.1 Test that every `Recipe` control id maps to a control in its schema under the recipe's option name. Verify: `test_schema.py::test_every_recipe_control_is_in_its_schema_under_the_recipe_option` passes and fails when an id is renamed. Builder options: follow-up.

## 4. Quote files and plan/apply (`core/quote-files`)

- [x] 4.1 Quote file model and parser (defaults, cards, `needs`). Verify: unit tests for defaults, missing fields and a synthetic fixture file.
- [x] 4.2 Offline validator against the schemas with errors that name the card, the field and the legal values. Verify: tests for unknown option, out-of-range value, missing required option; error text lists legal values; no browser is started.
- [x] 4.3 `plan`: validate, resolve via ranking, rate, report unmapped options and lock drift; no website writes. Verify: tests with a fake provider for ambiguous and exact requirements; a spy shows no share calls.
- [x] 4.4 Lock file read and write. Verify: a changed catalog price is reported in `plan` and the pinned spec is kept.
- [x] 4.5 `apply` through the existing publish path and gate. Verify: ported gate scenarios still pass; an unresolved requirement and a forced Edit mismatch each fail without leaving a saved list.
- [x] 4.6 CLI commands `schema pull|coverage|diff`, `plan-quote`, `apply-quote` (generated from the tool registry; `plan-quote` validates first, since `validate` already names the saved-list check). Verify: each documented command runs on a fixture and exits non-zero on failure.

## 5. MCP surface

- [x] 5.1 Register `plan_quote` and `apply_quote` in the single tool registry. Verify: MCP tool listing includes them; the CLI exposes the same functions.
- [x] 5.2 Expose schema resources and an index with version and coverage. Verify: an MCP client lists and reads a resource with no browser and no auth.
- [x] 5.3 Option errors list legal values and point to the resource. Verify: the `mcp-surface` illegal-value scenario passes.
- [x] 5.4 Update the quote workflow prompt to start from `plan_quote`. Verify: the prompt text names the new tools and the schema resources.

## 6. Spike: state and update-in-place

- [x] 6.1 With a throwaway account list, call `share/update` with changed cards and record whether the list id and share link stay the same. Verify: a short note in `docs/explanation/huawei/` with the observed result, the date and frontend version, with no client data.
- [x] 6.2 (deferred: recorded as an open question; see `docs/explanation/huawei/share-update.md` for the finding that an update needs a rollback the gate does not have) Decide state (local, shared, or none) in a follow-up ADR using 6.1. Verify: the ADR exists or the decision is recorded here as deferred.

## 7. Docs and rebase

- [x] 7.1 Reference pages for the schema and the quote file; update `docs/index.md` navigation. Verify: `mkdocs build --strict` passes.
- [x] 7.2 Rebase `ts-parity`: replace the builder and page-replay port tasks with schema-driven replay and shared fixtures, and renumber its distribution ADR. Verify: `openspec validate ts-parity` passes.

## Follow-up (out of this change)

- Map the 19 builder services' options to schema controls, using `autocalc schema coverage <service>` as the to-do list; until then `apply_quote` refuses options on those services (they are not mapped). Open it as its own change, ideally after `ts-parity` decides which builders survive.
