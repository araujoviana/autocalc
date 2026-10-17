# Proposal

## Why

ADR-0001 chose to publish by driving the real calculator form ("page as encoder"), but made
the migration conditional on a proof of concept: ECS in `sa-brazil-1`, with stored price ==
Edit price == rating engine for on-demand, monthly and RI. Nothing in the repo drives the
form yet, and the headless Edit check that the publish gate (ADR-0003) needs doesn't exist
either. This change builds both for ECS, runs the exit matrix, and records go or no-go before
`quote-core`, `publish-gate` and `spa-encoder` build on top of them.

## What Changes

- New page encoder, ECS only: given ECS options (region, flavor, billing mode, image, system
  disk, data disks, bandwidth), autocalc opens the calculator anonymously in a fresh browser
  context, fills the form by component id, clicks "Add to List", and returns the card the page
  built from its own cart store. It does not log in and saves nothing.
- The encoder fails closed. It returns no card when a field can't be set, a value isn't offered
  in the form, the page reports a failed price inquiry, or the page doesn't produce a card in
  time. The error names the field or the step, under a new `PAGE_ENCODE_FAILED` code.
- New Edit-price check: given a share link, autocalc opens it anonymously in a fresh context,
  opens each card's Edit view, and reports the price the page recomputes next to the stored
  amount. The publish gate will reuse this as its third check.
- A live proof harness (`uv run python -m tests.support.spa_poc`) encodes the exit matrix
  (on-demand, monthly and 1-year RI ECS cards in `sa-brazil-1`, with two data disks and a
  bandwidth), saves them as one list on the user's account, compares stored, Edit and rating
  amounts per card, prints a per-card report with a field diff against the Python builder's
  card, and deletes the list.
- ADR-0001 gets the outcome (go, or no-go with the failing modes) under "More Information".
  On go, the roadmap keeps `spa-encoder` as planned. On no-go, the roadmap says what changes.

### Out of scope

- Using the page encoder in `publish`, the CLI or MCP tools. The Python builders stay the
  only publish path until `spa-encoder` (roadmap #6).
- Services other than ECS, regions other than `sa-brazil-1` for the exit matrix, and yearly
  ECS cards (not part of the ADR-0001 criterion).
- The full publish gate: anonymous re-read validation, rating comparison policy, deleting a
  failed list, and `--keep-on-fail`. That's `publish-gate` (roadmap #4).
- Running the Edit check in parallel across many cards. Each check uses its own browser
  context, per ADR-0010, so `publish-gate` can parallelize it later without changes.
- Recipe generation from `viewConfig`. The ECS recipe is written by hand.

### Publish-gate impact

None today: the gate doesn't exist yet and `publish` is unchanged. The Edit-price check built
here is the component ADR-0003's third check ("headless Edit check per card") will call, so
its behavior is specified now and `publish-gate` adds no new Edit logic.

## Capabilities

### New Capabilities

- `huawei/page-encoding`: building saved-list cards by driving the real calculator page, and
  checking a saved card's Edit price the same way. Starts with ECS; `spa-encoder` extends it
  to the other services.

### Modified Capabilities

None. `huawei/card-encoding` keeps describing the Python builders, which remain the publish
path and the per-service fallback ADR-0001 allows.

## Impact

- Code: new `src/autocalc/page/` package (browser context, ECS recipe and encoder, Edit
  check); `src/autocalc/errors.py` (`PageEncodeFailed`). No change to `share.py`,
  `services/`, `cli.py` or `server.py`.
- Tests: offline unit tests for the recipe and the store readers against a saved store
  snapshot; a `live` pytest that encodes one ECS card anonymously (no credentials); the
  `tests/support/spa_poc.py` harness, which needs a login because it saves a list.
- Docs: new `docs/explanation/huawei/page-encoder.md` (how the page is driven, vendor
  observations), `docs/reference/errors.md` (`PAGE_ENCODE_FAILED`), ADR-0001 outcome,
  `docs/roadmap.md` if the outcome changes the plan, `mkdocs.yml` nav.
- Dependencies: none added. Playwright and the system-browser discovery from `auth-sessions`
  are reused; the login profile is never opened by the encoder or the Edit check.
- Account: the harness creates one list on the user's account and deletes it at the end.
