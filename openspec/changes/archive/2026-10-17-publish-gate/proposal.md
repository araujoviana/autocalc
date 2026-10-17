# Proposal

## Why

ADR-0003 says a link that reaches a customer must have been checked by the website itself, and
that a failed check deletes the list. Today `create_price_list` saves a list and returns the
link with no check: a stored price that differs from the Edit price (the 10,480.39 against
9,831.28 case) reaches the customer. The pieces exist but are not joined: `validate_list`
checks arithmetic, `tests/support/page_rating.rerate` re-prices an ECS card with the rating
engine, and `page.edit_check` re-prices each card on the page (spa-encoder-poc). A live probe
on 2026-10-17 showed the Edit check works on non-ECS cards too, and that it already catches a
real defect: EVS and Direct Connect cards were built with the wrong quantity-stepper labels,
so the page's form state differed after Edit.

## What Changes

- New gate: after a list is saved, autocalc (1) re-reads it anonymously, (2) validates it and
  compares every card's stored amount with a fresh rating-engine price, and (3) runs the
  headless Edit check per card. It returns the link only if all three pass for every card.
- On any failure, or if a check cannot run, the list is deleted and the caller gets a
  `GATE_FAILED` error with a per-card diff (stored, rated and Edit amounts and the reasons).
  The gate fails closed: a card whose Edit view cannot be read is a failure, never a pass.
- `AUTOCALC_KEEP_ON_FAIL=1` keeps a failed list for debugging and says so in the error. It is
  an environment variable, not a tool argument, so an agent cannot switch the gate off.
- `create_price_list` and `share.publish` publish through the gate. Rating re-prices any card
  from its own stored products, so the check is not ECS-only; the ECS RI rule is reused.
- Fix the defect the probe found: EVS and Direct Connect cards use `calc_5_`/`calc_6_` for the
  quantity stepper, as the portal's own cards do.
- Close the open item "settlement By monthly price re-prices to the same amount on Edit" with
  a live check, and remove its roadmap row.

### Out of scope

- Reworking the tool surface (`workflow-surface`), the page encoder for more services
  (`spa-encoder`), and fixing other services whose cards the gate may reject. A rejected
  service stays unpublishable until its builder is fixed; that is the point of failing closed.
- Running the Edit check in parallel contexts. It runs one browser, card by card, which is
  slower than ADR-0003's target. Parallel contexts are an optimization for later.
- `autocalc selftest` and `prune` (ADR-0003, ADR-0014).
- The four-region verification matrix per service; that belongs to each service's migration.

### Publish-gate impact

This change creates the gate. Every publish path now includes all three checks and the
delete-on-failure rule.

## Capabilities

### New Capabilities

- `huawei/publish-gate`: what must hold before a saved list's link is returned, and what
  happens when it does not.

### Modified Capabilities

None. `huawei/saved-lists` keeps describing the lifecycle; the gate adds a condition on the
link being returned and does not change an existing requirement's text.

## Impact

- Code: new `src/autocalc/gate.py`; `GateFailed` in `errors.py`; `server.create_price_list`
  and `share.publish` call the gate; `services/base.py`, `evs.py`, `dline.py` (quantity tokens);
  `tests/support/page_rating.py` moves into `gate.py`.
- Publishing now opens a browser and takes about 15 seconds per card.
- Account: a failed gate creates and deletes one list. A deletion that itself fails is reported
  with the list id.
- Docs: `docs/reference/errors.md` (`GATE_FAILED`), `docs/explanation/huawei/publish-gate.md`,
  `mkdocs.yml`, `docs/roadmap.md`.
