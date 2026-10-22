# Design

## Context

Edit rebuilds a card's form from `rewriteValue.template_RENDER`; `valueWatcher` is runtime-only and
is not saved, and the stored products are never consulted. Missing or invalid form state falls
back to the page's defaults, then the page re-rates ([ADR-0001](../../../docs/adr/0001-page-as-encoder.md),
`docs/explanation/huawei/edit-vs-list-price.md`). The calculator page is a Vue app whose cart
state lives in a Pinia store, and its cart view hydrates from a browser-storage hand-off the
page itself uses around its login redirect. The existing `validate` command is offline and
anonymous, and `share_detail` already reads any list without a session.

## Goals / Non-Goals

**Goals:**
- A read-only, anonymous check that reproduces what a customer sees after clicking Edit.
- Results that cannot be mistaken for success when the check could not run.
- Reusable by the later publish gate without redesign.

**Non-Goals:**
- Repairing drifting cards, or deciding which side (stored or Edit) is right. The report shows both.
- Reproducing the Save-after-Edit path.

## Decisions

**1. Load cards through the page's own state, not by driving the form.** The check opens the
calculator, builds cart items from the saved cards with the page's own list-loading action,
places them where the page's cart view picks up a pending list, reloads, and presses Edit. This
is the same code a customer's browser runs, needs no login, and does not require a per-service
recipe. Alternative: drive the form to rebuild each card from scratch. Rejected here because it
tests the encoder, not the saved card; it belongs to `spa-encoder`. Alternative: only compare
stored data to the rating engine. Rejected because it cannot see form-state drift, which is the
bug.

**2. Take the Edit amount from the page's rating request.** The check records the page's own
rating request and response during Edit and uses that amount and request lines. The displayed
price is rounded to two decimals and hides hourly drift. The product-line diff compares the Edit
request's lines with the stored card's lines by type, spec and size.

**3. Three outcomes: `ok`, `mismatch`, `unavailable`.** Any exception, timeout, missing page
internal, or unsupported card yields `unavailable` with a reason; only `ok` exits zero. A page
change therefore fails loudly instead of passing silently. Alternative: treat errors as warnings.
Rejected: a passing check that did not run is worse than none.

**4. Isolation per card, no login profile.** Each card runs in a fresh headless context with
no stored session, bounded concurrency (ADR-0010). This also guarantees the check never touches the
user's login profile or session, which research showed other tooling may be using at the same time.

**5. Static EIP rule in `validate`.** The drift seen in practice is cheap to detect offline: compare
bandwidth products with the public-IP form state. It runs without a browser, so it can gate
earlier and in CI. Page label tokens used for "not required" live in one named constant with a
comment pointing to the docs page, since they are vendor observations.

**6. Typed 413 error.** HTTP 413 maps to `PAYLOAD_TOO_LARGE` carrying the card count. No numeric
limit is hard-coded: the observed boundary (76 cards accepted, 149 refused) is not a measured
limit, and request size, not card count, is the likely cause.

**7. `doctor` asks the server.** It calls the session-requiring list endpoint once with the
stored cookies, no refresh and no browser, and reports the answer.

## Risks / Trade-offs

- Relies on page internals (store name, storage key, action name) that can change in a frontend
  release. Mitigation: decision 3 makes breakage loud; the nightly drift check on the roadmap
  can run `edit-check` against a fixed sample.
- Takes seconds per card; acceptable because it runs on demand or once per publish.
- Edit for services with no Edit view or a different form is `unavailable` until covered.
  Initial verified coverage is ECS; other services are attempted and reported honestly.
- The page may open first-run dialogs or cookie banners that block clicks. The check dismisses
  them before interacting and treats failure to do so as `unavailable`.

## Open Questions

None that change what gets built.
