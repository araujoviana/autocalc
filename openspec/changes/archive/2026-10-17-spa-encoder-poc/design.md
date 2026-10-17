# Design

## Context

See proposal.md for the why. What exists today:

- `EcsBuilder.build` / `build_ri` (`src/autocalc/services/ecs.py`) write `template_RENDER` by
  hand. Its keys name the form's component ids: `calculator_ecs_radio`,
  `calculator_eip_switch`, `calculator_eip_radio`, `calculator_ims_select`,
  `calculator_evs_stepper_main` and `calculator_evs_stepper_|addible0|_<k>`.
- Reverse engineering of frontend `CBC-PortalCalculator/11.4.201` found: DOM element ids equal
  the `viewConfig` component ids; the app is Vue 3 with Pinia stores (`cartInfo`,
  `serviceInfo`, `productInfo`, …) reachable from `__vue_app__`; anonymous "Add to List"
  (`#rshema_func_priceboard_addToList`, behind a `.guide-dialog, .v-modal` overlay) appends a
  full card to `cartInfo.cartListDataBase`; the cart persists in `localStorage`.
- `auth.find_browser()` picks a system Chromium-family browser on Windows and Linux.
  `auth._open_profile()` opens the *login* profile and is not what we want here.
- `tests/support/render.py` shows the pattern for a live, account-writing harness: create a
  list, check it in a browser, delete it in `finally`.
- `Builder.share_payload`, `share.Session.create/delete` and `share.share_detail` cover
  saving and anonymous re-read.

## Goals / Non-Goals

**Goals:**

- One driver that fills a form from a recipe (component id, kind, value) and captures the
  page's card. ECS is the only recipe, but nothing in the driver is ECS-specific.
- An Edit-price check `publish-gate` can call unchanged.
- A go/no-go answer for ADR-0001 within the time box, with evidence a reader can re-run.

**Non-Goals:**

- Speed. One browser per call is fine for the PoC; pooling is `publish-gate`'s concern.
- Generating recipes from `viewConfig`.
- Hiding the page encoder behind the `Builder` registry. That's `spa-encoder`.

## Decisions

### D1. A `page` package beside `services`

`src/autocalc/page/`: `browser.py` (fresh context), `store.py` (Pinia reads and pure-Python
normalizing), `driver.py` (recipe steps, capture), `ecs.py` (ECS options → recipe),
`edit_check.py`. Kept out of `services/` because those modules are the Python builders, and
`quote-core` will regroup code per provider anyway. Alternative: a single `page_encoder.py`.
Rejected because the Edit check and the driver have different callers (`publish-gate` and
`spa-encoder`).

### D2. Non-persistent browser, one fresh context per run

`browser.py` launches `chromium.launch(headless=True, **find_browser().launch_kwargs())` and
yields `browser.new_context(viewport=1366x900, locale="en-US")`, closing both. It never
touches `profile_dir()`. Alternative: `auth._open_profile`. Rejected: that's the login
profile, it allows one process at a time, and its `localStorage` cart is shared, which is
exactly what ADR-0010 forbids for form filling. Launch failures map to `PAGE_ENCODE_FAILED`
(step `browser`) with the same "no raw Playwright text" rule as `auth`.

### D3. Fill through the DOM; read the store, never write it

Each step acts on the element whose id is the component id (click a radio option, pick a
select option, type into a stepper, toggle a switch, press an addible's "add"). After each
step the driver reads the component's entry back from the page's form state and compares it
with the requested value. A mismatch or a missing option raises `PAGE_ENCODE_FAILED` naming
the component id.

Alternative: write the Pinia form state directly and trigger the page's product derivation.
Rejected: the per-service inline functions run from component watchers. Skipping them can
reproduce the very drift ADR-0001 exists to remove, and it ties us to internal function
names rather than to the component ids we already depend on.

### D4. A recipe is data

`Step(component_id, kind, value)` with `kind` in the `viewConfig` component types the ECS
form uses (`RadioGroup`, `Select`, `CommonStepper`, `Switch`, `Addible`). `page/ecs.py`
turns the same option names `EcsBuilder.build` takes into steps, so the harness can compare
both cards for the same options. Region, billing mode and RI term are page-level controls,
also expressed as steps. Their selectors come out of task 1.1.

### D5. Capture is "wait for a settled price, then Add to List"

The driver watches rating responses (`ratingservice/v2/inquiry`) on the page. When none has
been in flight for a short quiet period, it reads the price board state. A failed inquiry
(an `exceptionId` response, or the page's own `inquiryfailed` state) raises
`PAGE_ENCODE_FAILED` with step `inquiry`. Otherwise it removes the guide overlay, clicks
Add to List, waits until `cartInfo.cartListDataBase` grows by one, and returns that item
through `JSON.parse(JSON.stringify(...))`, so Python gets plain data, not Vue proxies.
Every wait has a deadline, and a missed deadline raises with the step that timed out.

### D6. Edit check reads amounts from data, not page text

`edit_check(list_id)` gets stored amounts from `share_detail` (anonymous HTTP). In a fresh
context it opens the share URL, clicks View Details (which copies the cards into the anonymous
cart), clicks card *i*'s Edit, and waits for a settled price (D5). It then clicks the editing
card's Save, which writes the re-priced card back to its cart entry, and reads that entry's
`amount` once its `timeTag` has changed. The price board keeps no readable copy of the
re-priced card, so Save is the only data path. It compares both amounts as `Decimal` rounded
to cents and returns one `EditResult(index, stored, edit, equal, reason, warning)` per card.

The walkthrough found that the page's own "No data matched…" dialog after Edit shows up
intermittently, even for a card that re-prices exactly (see
`docs/explanation/huawei/page-encoder.md`). So the dialog is recorded in `warning` but doesn't
decide anything. Instead, `equal` also requires the form's final `rewriteValue` to match the
stored one under the page's own comparison rule. A card whose
Edit view doesn't open or settle gets `equal=False` and a reason. The check never raises for
a per-card failure. It does raise if the list can't be read at all, because then there's no
per-card result to report.

### D7. The harness is the exit criterion

`tests/support/spa_poc.py` (`uv run python -m tests.support.spa_poc`):

1. Encode three ECS cards in `sa-brazil-1` (`c7n.large.2`, Ubuntu, GPSSD 40 GB system disk,
   two 50 GB GPSSD data disks, 5 Mbit/s bandwidth): on-demand, monthly, RI `1_3`
   `NO_UPFRONT`. The three encodes run concurrently, which also exercises the isolation
   requirement.
2. Build the same three cards with `EcsBuilder` and print a field diff per card. Use the
   ignore set from `tests/support/golden.py`, plus `rewriteValue` keys that hold only labels.
   The diff is informational: it tells `spa-encoder` what the Python builder gets wrong. It
   doesn't decide go or no-go.
3. Save the page cards as one list named `autocalc-poc-<timestamp>` (via the user's session),
   then re-read it with `share_detail`.
4. For each card, get the rating amount by re-pricing a deep copy of its stored products
   through `EcsBuilder`'s pricing path (`Builder.price`, or `_price_ri` for RI), and run
   `edit_check`.
5. Print a table of stored, Edit and rating amounts per card, plus the frontend version the
   page reports. Delete the list in `finally`. Exit 0 only if every row is equal.

Rejected alternative: a `live` pytest. The `live` marker promises "no credentials, read-only",
and this run saves a list.

### D8. `PAGE_ENCODE_FAILED`

`PageEncodeFailed(CalculatorError)`, `code = "PAGE_ENCODE_FAILED"`, with
`details = {"service", "step" | "field", "frontend_version"}` and a hint to re-run with
`AUTOCALC_PAGE_HEADED=1`, which shows the browser. That env var is the only debugging aid
added.

### D9. Tests

- Offline: the ECS recipe for each billing mode and for 0, 1 and 2 data disks; store
  normalizing against a saved, sanitized store snapshot (a synthetic card with no account
  data, kept under `tests/fixtures/page/`); `Decimal` cent comparison; the step read-back
  check, using a fake page that answers `evaluate` from a dict.
- Live, anonymous (`-m live`): encode one monthly card and assert its amount equals the
  rating engine; encode two different cards concurrently and assert each matches its own
  options.

### D10. Time box and outcome

Three working days, counted from task 1.1. **Go**: the harness exits 0. Record the run date,
frontend version and table in ADR-0001, and archive with the full spec delta. **No-go or
partial**: record which modes failed and why in ADR-0001. Remove the "Page-encoded ECS cards
are Edit-faithful" requirement from the delta before archiving, because a spec ships only
when it's true. Keep the encoder and Edit check if their own requirements hold, and update
the roadmap row for `spa-encoder`. If the time box runs out with the matrix still unrun,
that counts as no-go and gets recorded the same way.

## Risks / Trade-offs

- [A frontend release changes ids or store shape] → Every error and every harness report
  carries the frontend version. The read-back check in D3 turns silent drift into a named
  failure.
- [The shared list's Edit view behaves differently anonymously, e.g. it imports into the local
  cart first] → It runs in a throwaway context, so importing is harmless. Task 1.1 confirms
  the flow before `edit_check` is written.
- [RI is a different form path (term and payment controls) and fails while the others pass] →
  D10's partial outcome. ADR-0001 already allows the Python builder as a per-mode fallback.
- [`sa-brazil-1` inquiry fails for a default option, as `ap-southeast-1` did] → D5 surfaces it
  as `inquiry` and the recipe sets every priced field explicitly. No default is relied on.
- [Headless rendering differs from headed] → `AUTOCALC_PAGE_HEADED=1` for comparison. The
  viewport is fixed at the size `auth` already uses.
- [Seconds per card] → Acceptable per ADR-0001: publishing happens once per quote.
- [The harness leaves a list behind after a crash] → It deletes in `finally`, and the
  `autocalc-poc-` prefix makes leftovers easy to find and remove.

## Migration Plan

None. Nothing that ships today calls the new package. Rollback is reverting the branch.

## Open Questions

- The exact selectors for the region, billing-mode and RI-term controls, and the store path
  of the price-board amount. Task 1.1 records them in the explanation doc. They change no
  requirement and no task.
