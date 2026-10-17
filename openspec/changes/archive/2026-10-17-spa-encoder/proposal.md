# Proposal

## Why

ADR-0001: the calculator page is the card encoder. The proof of concept (`spa-encoder-poc`)
showed this for ECS in three billing modes. The Python builders still produce every card that
`publish_quote` saves, so an Edit-price mismatch stays possible for any service whose builder
drifts from the page. This change moves the seven existing services (ECS, EVS, CCE, ELB, OBS,
RDS, SFS Turbo) onto the page encoder.

Seven hand-written recipes would repeat the ECS one. A builder card already says what the form
should hold (`rewriteValue`: control id → value), so the page encoder replays that state on the
real form and the page builds the card.

## What Changes

- New `page/replay.py`: `card_steps(rewrite_value)` turns a builder card's form state into
  driver steps (globals, then each control; one add click per addible row), and
  `encode_card(service, rewrite_value)` drives the page and returns the page's card. It raises
  `PAGE_ENCODE_FAILED` (step `form`) if the page's form state differs from the one asked for.
- The driver learns an `auto` step kind (the form says whether a control is a radio, select or
  stepper), the `base-radio-stepper` and plain-input (`common-input`) controls, and a blur after
  typing. A hidden control is skipped only when the form already holds the wanted value (the ELB
  IP count of a private load balancer, the quantity of a service without one).
- A stepper is read back from the form state, not only from the input box, so a value the page
  rejects (SFS Turbo capacity must be a multiple of 1.2 TB from 3.6 TB) fails instead of leaving
  the old value in the card.
- `publish_quote` encodes every card on the page (cards in parallel) after the builder resolved
  the options, and passes the page's card to the gate. `rds` and `sfsturbo` join the services it
  accepts.
- A live harness (`tests/support/spa_matrix.py`) saves one card per service and billing mode,
  re-reads the list and runs the Edit check and the rating comparison per card.

### Out of scope

- Services beyond the seven: they join with the builder waves.
- `publish_quote` for CCE, ELB and OBS: their builders have no spec argument that a ranked
  candidate fills, so they stay on `quote` for now.
- Falling back to the builder's card when the page cannot encode: the publish fails instead
  (ADR-0001, fail closed).
- Replacing the ECS recipe: it stays, tested and used by the PoC harness.

### Publish-gate impact

None. The gate runs unchanged on the page-encoded cards.

## Capabilities

### Modified Capabilities

- `huawei/page-encoding`: any supported service is encoded from a form state; form-state check.
- `mcp-surface`: `publish_quote` publishes page-encoded cards and accepts RDS and SFS Turbo.

## Impact

- Code: `page/replay.py` (new), `page/driver.py`, `page/store.py`, `workflow.py`.
- Tests: offline replay tests and fake-page tests; live matrix.
- Docs: `docs/explanation/huawei/page-encoder.md`, ADR-0001, `docs/roadmap.md`.
