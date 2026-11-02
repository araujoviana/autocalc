# Edit verification: reliable first, fast second

Research note, 2026-11-02, branch `ts-parity`. Question: how do we make the per-card Edit check
trustworthy, and only then cheap. Nothing here changes code. Everything marked "not verified"
at the end was not observed.

Method and sources:

- Our code at the line numbers given, read in full: `page/edit_check.py`, `page/store.py`,
  `page/driver.py`, `page/replay.py`, `page/browser.py`, `gate.py`, and the TypeScript port in
  `experimental/bun/src/core/edit-check*.ts`.
- ADR-0001, 0003, 0010, 0016, the Huawei explanation pages, the `huawei/*` specs, git history,
  and GitHub issues #1, #2, #4, #5 (read with `gh issue view`).
- The real framework bundle, `CBC-PortalCalculator/11.4.201`, downloaded from the public CDN into
  a scratch directory (not the repo): `framework.js` (60,546 lines, sha256 `bd9a0b42...71ff`,
  identical to the repo's cached copy), plus the `vueRelated` chunk (Vue 3.4.21, from the
  `version` constant at L7773) and the OBS and Kafka service configs. The live calculator page
  still served 11.4.201 on 2026-11-02. Line numbers below are in `framework.js` unless stated.
- Playwright and Vue documentation, cited by URL.
- Offline measurements only. No login, no session, no list created, changed or deleted.

## Summary

Ranked recommendation, most valuable first:

1. **Give every card a three-valued, evidence-based verdict: `ok`, `drift`, `load_failed`.**
   Today a timeout while the page is still refilling is reported as a form-state difference
   (`edit_check.py:112-115`), and any failure deletes the whole list with no retry
   (`gate.py:162-166`). `drift` must require proof that the page had finished; anything else is
   `load_failed`.
2. **Judge the artifact Save writes, not an instant before it.** After Save, compare the saved
   cart item against the stored card in both directions (form state, product identities, amount)
   and re-rate the saved products. This closes the gap between "form matched at poll N" and
   "what Save stored" and catches leaked extra state, which the current check ignores.
3. **Replace the 1.5 s quiet window with the framework's own identifiers.** Every submitted form
   state gets a `timeTag`, the rating request carries it, and the price board discards results
   whose tag is stale (L47414, L42062, L42626). "Priced for the latest tag" is a deterministic
   signal. Count a failed rating only if it belongs to the final tag.
4. **Check each card in a fresh anonymous context** (open the share link, View Details, Edit
   that one card). It removes card-to-card state leaks, and a retry then starts clean. A shared
   cart stays available as an informational second pass.
5. **Add a known-defect table with narrow, versioned, falsifiable entries.** A matched card is
   reported as `known_defect`, never `ok`, and publishing it needs an explicit per-run
   acceptance. Entries expire when the framework version changes.
6. **Only then parallelize.** Browser and context starts are cheap (measured below). The real
   cost is the calculator page load, which we have not measured. Run the experiments in
   "Experiment protocols" first.
7. **Keep the Edit view.** Rating, validation and request-fidelity checks cannot see the classes
   of defect listed in section 5.

Top findings behind this:

- The framework only compares the stored form state with the refilled one once, on the first
  emission after Edit starts (L56533-56537). It is a race detector, not a verdict, and our
  decision to ignore the dialog is right.
- The OBS pay-per-use defect is confirmed in source: `changeNextStatus` clears a pending rewrite
  when a cascaded source is momentarily empty (L45928-45944), and the OBS config makes exactly
  that happen (`calculator_multiAZ_radio` is cascaded on `calculator_storageType_switch`, which
  is still empty when the first switch emits). It is a class of defect, not one control.
- The current check can pass a wrong card in a few ways (leaked extra state, offsetting lines,
  late state change after the poll) and fail a right one in more (slow refill reported as
  drift, sticky failed-inquiry flag, load flakes with no retry). Section "Failure modes" lists
  them.

## 1. False negatives and false positives

### How the page applies a stored card on Edit

Reading `template-render` (L45837-46109) and the cart code (L56042-56670):

1. Edit puts the stored `rewriteValue` into `rewriteValue` and calls `template-render.setValue`
   (L56181-56188, L56648-56653).
2. `setValue` (L46080-46089) sets `rewriteStatus[id] = true` for every top-level component named
   in the stored value, resets `rewriteStatus` and `cacheComponentData`, and calls
   `initComponent`. It does not clear `valueWatcher`, which holds the last value of every
   control (L45903 clears it only in `clearState`, run when the view config recomputes).
3. Each component restores its value when its data arrives. `changeNextStatus` (L45928-45954) is
   where a component with `rewriteStatus` true and data present calls
   `refMap[id].setValue(rewriteValues[id])` on the next tick. If the data is present but
   `judgeShow` is false, the branch at L45941 sets `rewriteStatus[id] = false` and never calls
   `setValue`. The stored value is dropped silently.
4. `valueChangeHandler` (L46002) clears `rewriteStatus[id]` when the component emits.
5. `emitValue` (L46090-46109, debounced 50 ms) emits to the page only when no `rewriteStatus` is
   still true (L46100). Pages that never clear a flag never emit.
6. The emission becomes `selectedInfo.originSelectedInfo` (L56444); the price board sends
   rating requests and, if the result's `timeTag` still equals the board's, emits
   `fixedSelectedInfo` (L42626-42633). `handleFixedSelectedInfo` (L56479-56545) copies that
   priced state into `cartInfo.editInfo` and compares the stored `rewriteValue` with it once
   (L56533), opening "No data matched" on a difference, then clears the stored copy
   (L56537). Later emissions are not compared.
7. Save sends the latest `fixedSelectedInfo` with the card's `_cartId` (L56600-56610), which
   lands in `cartListDataBase`.

`timeTag` is `new Date().getTime()` taken when the page builds the selected product (L47414). It
is the order id sent with the rating request (L42013, L42062) and is read back from the
response (L42127-42133). So each emitted form state has its own tag, and the board ignores
results for any other tag.

Two facts that follow:

- The dialog is opened by the comparison of the **first** emission only. An early partial
  emission opens it even when the final state is perfect. This matches the "about half of the
  runs" observation in `docs/explanation/huawei/page-encoder.md`. Why the first emission is
  partial is not established.
- `editState().stored` in `page/store.py:304-311` reads `editInfo.originData.rewriteValue`.
  After the first priced action the page replaces `originData` with the re-priced payload
  (L56515-56521), so that field is not the stored card any more. `edit_check` correctly uses
  the card read from `share/detail`, not that field.

### What can lose or leak state

| Mechanism | Evidence | Effect |
|---|---|---|
| Rewrite dropped when a cascaded source is momentarily empty | L45941 (the only `isEmpty(rewriteStatus)` in the bundle); OBS config L285-287 and L307-309 (`calculator_multiAZ_radio` cascaded on `storageType_switch` and `productType_switch`; the filter `data.storageType === storageType` returns `[]` for `''`); issue #2 trace | OBS pay-per-use capacity refills as 0. Package mode (`sources`-based) is not affected. |
| Same class elsewhere | Kafka config has 8 cascaded sources in a chain (`kafka.json` L213-434) | Possible cause of the Kafka yearly mismatch in issue #4. **Not shown**; no trace made. |
| `valueWatcher` not cleared on `setValue` | L46080-46089 vs L45900-45905 | Values of controls absent from the next card can survive and be emitted (L46090-46099 emits every key with `showTag` true). Consistent with issue #2's third finding (capacity and `download*` leak to the next OBS card). The runtime path was not traced. |
| Inner components keep their own state | `commonSetup` (L37374-37489) and the base components keep `currentValue` | Same as above, per control. |
| Stale `fixedSelectedInfo` | Save reads it unconditionally (L56602) | If an Edit produced no new priced action, Save would write the previous card's payload under this card's id. Bounded: our form-state check uses the board's state, which would be stale in the same way, so a pass needs two identical cards. |
| Page's own 10 s watchdog | L56709-56725 | If the page-load state is still open after 10 s, the page closes its spinner, sets `wrongTag` and disables its buttons. Our waits are 20 s, so we can wait through a state the page already gave up on. |
| Card without `rewriteValue` | `_canEdit = Boolean(rewriteValue)` (L8077) | No Edit button; our check reports "the Edit button did not respond". |

### What `converged` can and cannot detect

`converged()` (`edit_check.py:106-110`) runs `store.rewrite_mismatches` (`store.py:359-377`)
between the stored form state and the board's current one. It mirrors the page's rule
`compareRewriteValue` (L3766-3779): every non-empty stored value must be present and equal.
I ran the function offline on synthetic inputs:

| Input | Result | Meaning |
|---|---|---|
| Current has an extra non-empty key (a leaked value) | no mismatch | Leaks are invisible unless they change the amount. |
| Stored `''`, `None`, `[]`, `{}` against a page default | no mismatch | A control the page fills by default is not seen. |
| Stored `6.0` against current `"6"` | mismatch | Stricter than `replay.same_value` (`replay.py:38-46`); a possible false failure for builder-made cards. |
| Lists in another order | no mismatch | Looser than the page's `isEqual`; harmless for the verdict. |
| Stored `0` against a missing key | mismatch | Good. |

It also cannot tell whether the state it saw is the final one. It is a single read of the last
emitted state (the board's `selectedInfo`, `store.py:304-311`), not the DOM and not what Save
stores.

### Other points

- **No-data dialog.** Handled right in principle: it is reported (`warning`) and not used
  (`edit_check.py:108`, `:610` test). `_close_warning` removes `.v-modal` nodes from the DOM
  (`edit_check.py:55`), which is a side effect on the page we have not assessed.
- **Amount equality to the cent is necessary, not sufficient.** `cents` rounds half up both
  sides (`store.py:380-382`). Equal totals can hide different products (a line replaced by
  another of the same price, a zero-priced line added or lost, offsetting changes). The
  repo's own gate already compares product identities for requests (`gate.py:83-93`
  `request_issues`) but not for the Edit result.
- **Request fidelity is outside the Edit check.** ADR-0016 says stored, Edit and rating
  agreement does not establish that the card is what was asked for. `request_issues` covers it
  at publish time only, and only when the expected cards are passed (`gate.py:98`, `:109-111`).
- **TypeScript port.** `edit-check-browser.ts` is per-card isolated (a new anonymous context and
  a seeded cart, L47-77) and diffs product lines, which is good. It judges the **last rating
  response** seen (L127-130), settles on 500 ms of quiet (L125), has no form-state convergence
  check, does not click Save, and supports only ECS and OBS (L43). Per ADR-0016 the Python
  semantics are canonical, so the port should adopt the design below rather than the reverse.

## 2. Settled and converged: signals instead of waits

### What the code does now

- `Driver.settle` (`driver.py:332-340`) waits until no rating request or catalog request is in
  flight and no rating has finished for `quiet = 1.5` s (`driver.py:39`, `:334-336`). The 1.5 s
  is an empirical choice; no document records how it was derived.
- `Driver.mark` bumps a generation counter (`driver.py:180-183`). A failed rating response is
  attributed to the generation current when the request was **sent** (`driver.py:74`, `:106`).
  `_failed_gens` is sticky (`driver.py:118-120`), so one failed inquiry sent after `mark()` for
  an intermediate state fails the card even if a later request, for the final state, succeeds.
- In `check_card` the floor is one quiet window per card (`edit_check.py:116-120`), about 1.5 s
  of the roughly 7 to 15 s a card costs (see section 3). Removing it saves at most about 10 to
  20 percent. The settle logic matters for correctness more than for speed.

### Signals, with what each proves

| Signal | Source | Proves | Does not prove | Reliability |
|---|---|---|---|---|
| Priced for the latest tag: `editInfo.originData.selectedProduct.timeTag` equals the board's `selectedInfo.selectedProduct.timeTag`, and every product has `inquiryResult` | L56515-56521, L42626-42633, L41573 (`fixSelectedInfo` keeps the tag), L47414 | The latest submitted state has been priced and delivered | That no later emission is coming | High, same access path as `store.editState`. Version specific: re-check on every frontend version. |
| Rating request body carries the tag (`id` starts with `timeTag-`, or `orderRequestId`) | L42062, L42013 | A response can be tied to a form state, so only a failure for the final tag counts | - | High, but the request is observed from the network, as now |
| Rating and catalog requests in flight = 0 | existing, `driver.py:65-107` | Nothing outstanding right now | Requests not yet issued (50 ms debounce L46109, nested `nextTick` L37426-37433) | Good as a necessary condition, weak alone |
| Form state matches stored | existing, `store.rewrite_mismatches` | The restored fields are the stored ones | Final-ness, extras | Necessary, not sufficient |
| Framework spinner closed (`Loadings.service` target `#pane-*` or `#calc-page`, L56153, closed at L56525-56528 and by the 10 s watchdog L56709-56725; element class `tiny-loading` in the `tinyVue` chunk) | source | Page considers the load finished (or gave up) | Which of the two | **Candidate.** Selector not confirmed at runtime. |
| Card Save button enabled | price-board `changeDisabled` (L56442, L56541) | - | - | **Do not rely on it.** For `sign=common` while editing, the price board has no buttons (`buttonMap.common_true = []`, L5324-5330), so the Save we click is the cart card's, whose enablement rule was not found. |
| Vue `nextTick()` | Vue docs (https://vuejs.org/api/general.html#nexttick): "waiting for the next DOM update flush"; source `vueRelated.js` L1588-1591: returns `currentFlushPromise \|\| resolvedPromise` | The current DOM flush finished | Network work, timers, the framework's chained `nextTick`s. The scheduler's `isFlushing`, `isFlushPending` and `queue` are module-private (L1579-1583), so idleness cannot be probed. | Useful only to cut poll latency; not a settled signal |
| Playwright `networkidle` | https://playwright.dev/python/docs/api/class-page (`wait_for_load_state`): "DISCOURAGED ... rely on web assertions to assess readiness instead" | - | - | Do not use |

### Proposed rule

A card is **settled** when, for two consecutive polls at least 200 ms apart, all of these hold:
the board's tag is unchanged, the cart's `originData` carries that same tag, all its products
carry `inquiryResult`, nothing is in flight, and the form state matches the stored one. There
is still a hard deadline; hitting it gives `load_failed`, not `drift`. The only time-based
residue is two polls instead of a 1.5 s window.

This still cannot prove that no later emission is coming. That is why recommendation 2 exists:
the verdict is taken on the Save artifact, so a late emission before Save changes what is
compared, and a late one after the check cannot affect what Save wrote. Combined, correctness
no longer depends on the settle timing. The settle only decides whether a mismatch may be called
`drift`: a mismatch seen before the settled predicate holds is `load_failed`, and the attempt is
repeated.

## 3. Parallelism

### Is it safe?

- **Client state.** Playwright contexts are "equivalent to incognito-like profiles", each with
  its own local storage, session storage and cookies, "fast and cheap to create and ...
  completely isolated, even when running in a single browser"
  (https://playwright.dev/python/docs/browser-contexts, section "Isolation"). The page keeps its
  cart in browser storage (ADR-0010), so a context per card has no shared cart. The repo's spec
  already requires a fresh context per Edit check (`openspec/specs/huawei/page-encoding/spec.md`,
  "Each run uses its own browser context").
- **Shared cart is the risk, not parallelism.** Today one context checks all cards in order
  (`edit_check.py:144-156`). Leaks between cards (section 1) are a property of that shared
  state. A fresh context per card also matches a customer who opens the link and edits one
  card first.
- **What a leak means.** A leak that fails a card in sequence is a real portal defect for a
  customer who edits several cards in a row, but the stored price is not wrong. Report it in a
  separate informational pass, not as the verdict on the stored price.
- **Server side.** The check is anonymous. `share/detail`, rating and catalog need no session
  (`docs/explanation/huawei/sessions.md`), and the Edit check writes nothing to an account
  (`page-encoder.md`, "Edit check"). What the portal keeps per anonymous session, and any
  per-IP limit, is **not documented and not measured** (ADR-0010: the cap of 4 is "a politeness
  limit, not a measured server limit"). The only evidence is the region sweep: 6 contexts,
  25 min down to 7.5 min (commit `d2b5d65`), with page-load timeouts that had to be retried
  (`docs/explanation/huawei/concurrency.md`). That is 3.3x for 6 workers, not 6x.
- **Not traced:** that Save in the Edit view never calls a `share/*` write for an anonymous
  context. Experiment E1 records all non-GET requests to check.

### Python specifics

Playwright's sync API "is not thread-safe ... create a playwright instance per thread"
(https://playwright.dev/python/docs/library, "Threading"). `page_context` already starts a
playwright and a browser per call (`browser.py:34-62`), which is the right shape for worker
threads. The documented Playwright Test parallelism also gives each worker its own browser
(https://playwright.dev/docs/test-parallel, "Worker processes"). In Bun, one browser with many
contexts is the natural shape.

`encode_workers()` caps at 3 and budgets 768 MB per worker (`browser.py:82-95`).

### Measured cost of starting a context (offline, this machine)

System Chromium, headless, `about:blank`, 8 launches and 24 contexts, script not committed:

| Step | Median | Max |
|---|---|---|
| `chromium.launch` | 184 ms | 283 ms |
| `browser.new_context` | 22 ms | 66 ms |
| `new_page` + `goto about:blank` | 147 ms | 221 ms |
| `context.close` | 9 ms | 25 ms |
| `browser.close` | 53 ms | 67 ms |

So starting a browser or context is negligible next to a card. The cost of a fresh context is
the **calculator page load** plus View Details: configuration, catalog, the 2.8 MB `framework.js`
(about 1.0 MB over the wire; fetched here in 0.10 s warm, 0.51 s cold), and rating. That has not
been measured; it needs a live page (E1). Whether Chromium shares an HTTP cache between contexts
is not documented in the pages I read; assume it does not.

### Recorded timings in the repo (they disagree)

- `publish-gate.md`, "Cost": about 15 s per card, one after another.
- `publish-gate.md`, "Live check": 3 cards through the whole gate in about 27 s.
- ADR-0001, proof of concept: the Edit check "takes about 20 s for the list" (3 cards); encoding
  3 cards in parallel contexts about 16 s.

15 s per card does not fit 20 s for three cards. Model the check as `T = F + n*c`, where `F` is
browser start, page load and View Details, and `c` is the work per card. With `F + 3c = 20`
and an **assumed** `F = 5` s, `c = 5` s. These are not measurements.

### Honest speedup estimate (illustration, uses the assumed F and c)

For a list of 30 cards. Today (shared context, sequential): `F + n*c = 155` s.
Fresh context per card, `W` workers: `ceil(n/W) * (F + c)`.

| Workers | Ideal time | Ideal gain vs today | At the sweep's observed efficiency (55 percent at 6 workers) |
|---|---|---|---|
| 1 | 300 s | 0.5x (slower) | - |
| 3 | 100 s | 1.5x | about 1.2x |
| 6 | 50 s | 3.1x | about 1.7x |

If `F` is much smaller than `c`, the gain approaches `W`. If `F` is larger than `c`, fresh contexts
can be slower than today even with three workers. Conclusion: fresh-per-card is chosen for
correctness; the speed comes from cheaper waiting and from a few workers, and the number must
come from E1 and E3. Speed levers that do not cost trust, in order of likely size:

1. 2 to 3 fresh contexts in parallel (needs E3).
2. `lean=True` (skip images, fonts, media) in `edit_check`; it is off at `edit_check.py:144` and on in `replay.py:114`, and `browser.py:37` claims about 15 percent faster loads. Verify the verdict does not change.
3. Drop the 1.5 s window for the predicate in section 2 (at most about 1.5 s per card).
4. Evaluate the predicate inside the page with one `page.wait_for_function` instead of a poll per 100 ms (https://playwright.dev/python/docs/api/class-page, `wait_for_function`): fewer round trips.
5. Skip loading the whole list in every context by seeding one card, as the TypeScript port does. Faster, but it bypasses the page's own list-to-cart conversion, which a customer uses. Needs E4 before it can be the verdict path.
6. Deduplicate cards that are identical in everything the check reads, within one run. Valid only because each check starts from a clean context; record "verified via card k".

Do not cache verdicts across runs. A verdict depends on the frontend version, the catalog (24 h
cache, `concurrency.md`) and portal state, and a stale `ok` is the failure the owner cannot afford.

## 4. Determinism, retries and the known-defect table

### Verdict per attempt

An attempt is one card, one fresh context, the full path. Map today's reasons:

| Today's reason (`edit_check.py`) | Proposed status |
|---|---|
| shared list did not open; `PageEncodeFailed` at `open` (`:152-155`) | `load_failed` |
| card not in the page's price list after View Details (`:96`) | `load_failed`; on a repeat, "not editable or not copied" (also the no-`rewriteValue` case) |
| Edit button did not respond (`:100`); Edit view did not open (`:102`) | `load_failed` |
| form state differs after Edit (`:115`) | `drift` only if the settled predicate held at some poll and the mismatch persisted; otherwise `load_failed` ("did not converge") |
| Edit view did not re-price (`:120`; failed inquiry) | `load_failed` if the failing response is a network error, 5xx or timeout; `drift` ("the portal cannot price its own card") if an HTTP 200 with the same `exceptionId` repeats on a second attempt |
| Save did not respond (`:125`), not saved back (`:128`) | `load_failed`; if the Save control is disabled while the state is settled, `drift` ("page refuses to save") |
| unpriced products (`:131`) | `drift` |
| Edit re-prices to X, stored Y (`:134`) | `drift` |
| equal and artifact checks pass (`:135`) | `ok` |

Artifact checks after Save (new): saved `rewriteValue` equals stored in both directions (extras
reported); saved product identities equal stored ones (the keys `gate.py:91` already uses);
amount equal to the cent; the saved products re-rated by the rating engine (`gate.rerate`) equal
the saved amount, so the Edit price is itself a real rating; `timeTag` of the saved card is newer
than the Edit click and equal to the board's.

### Retry policy

- Retry **only** `load_failed`, each time in a new context, at most 3 attempts, 2 s then 4 s
  backoff (as `tests/support/region_sweep.py:36-52` does for encode). Never retry in the same
  context: the failed attempt leaves state behind.
- The first attempt that is not `load_failed` is final. `drift` is never re-run to look for a
  pass, so a retry cannot turn a drift into an `ok`.
- If a diagnostic confirmation run is ever requested, the combination is monotone: any `drift`
  in any attempt makes the card `drift` ("unstable drift"). `ok` needs every completed attempt `ok`.
- Three load failures in a row make the card `load_failed`: the list is not published, and the
  message says "could not check", not "wrong price". The gate stays fail-closed
  (`gate.py:162-166`); only the classification and the retries change.
- An `ok` rests on one proven attempt by default. A `--paranoid` option can require two
  independent fresh-context `ok`s.
- Why it matters: with a per-card load flake of 1 in 100 (the owner's report in issue #5, not
  our measurement) a list of 30 cards loses about 26 percent of its publishes to flakes
  (1 - 0.99^30), of 10 cards about 10 percent, of 50 cards about 40 percent. With 3 attempts,
  and if failures were independent (an assumption), the per-card chance of ending `load_failed`
  is about 1 in 10^6. A site outage is not independent, and it correctly ends as `load_failed`.

### Known-defect table

Purpose: a list is not blocked by a portal bug we cannot fix, and a card with a wrong stored
price is never hidden.

Entry fields (YAML or JSON next to the service code; do not put customer data in it):

```yaml
id: obs-payperuse-capacity-lost
service: obs
applies_to:                      # narrow: the same card shape as the reproduction
  chargeModeName: ONDEMAND       # packages (calculator_storagePack_radio) are not affected
  has_usage_factor_prefix: size
framework: ["11.4.201"]          # exact versions; any other version makes the entry inert
signature:
  mismatch_paths_subset_of: [<paths from E5>]   # the drift must be within this set
  edit_amount_model: <optional offline formula, e.g. rerate(stored products, size usage 0)>
requires_pass: [validate, rating_equal, request_fidelity]   # the non-Edit checks must pass
evidence:
  issue: "#2"
  source: "framework.js L45928-45946; obs config L285-309 (11.4.201)"
  reproduction: "docs/research or run record id, with date and run count"
  verified_on: 2026-MM-DD
expires: "frontend version change, or 90 days, whichever first"
```

What an entry needs before it is accepted:

1. **Framework version**, exact. The table is keyed on the version the run actually loaded
   (`Driver.frontend_version`, `driver.py:43`, `:164`). A different version makes every entry
   inert, and the cards go back to `drift` until someone re-runs the reproduction.
2. **Reproduction**: a synthetic card (no customer values), the fresh-context steps, at least 10
   of 10 identical results (E5), the mismatch paths and the Edit amount observed.
3. **Root cause or a falsifiable signature.** Issue #2 has a source-level cause. For Kafka yearly
   (issue #4) the cause is not isolated, so its entry can only match on observed mismatch paths
   and amount, and it must say "cause unknown".
4. **Evidence that the stored price is right**, independent of the Edit view: the rating
   engine equals the stored amount and the request-fidelity check passes (`gate.py:96-145`).
5. **A negative control** from the same run: a sibling card of the same service that is known to
   pass (OBS packages, for example). If the control also fails, the harness is suspect, not the portal.
6. **Expiry**: version change, plus an age limit so an entry cannot outlive its last check.

How it is applied:

- Match order: `drift` first (settled proof), then the entry. The drift must lie inside the
  entry's signature, and the non-Edit checks must pass. Anything outside the signature stays `drift`.
- Result is `known_defect` with the entry id. It is not `ok`. By default the gate treats it as a
  failure. The caller can accept named ids for one run (`accept_known_defects=[id]`, no global
  switch, same spirit as `AUTOCALC_KEEP_ON_FAIL`), and the id and the Edit amount are written into
  the run record (ADR-0009) and shown next to the link.
- No service-wide waiver. "All OBS" would hide a wrong OBS price.
- Drift detection for the table itself: if a version is listed and a card matching the entry
  unexpectedly passes, warn that the entry may be stale.
- Card-side mitigations (canonical OBS line set, ordering) remain a builder matter (issue #2,
  issue #5 item 2). The table is for what the builder cannot fix.

## 5. Cheaper checks: what each can and cannot prove

| Check | Proves | Cannot prove |
|---|---|---|
| Offline validation (`validate.py`; template audit tests) | Shape, finite numbers, sums, RI aggregates, product index sequence | That the products follow from the form state |
| Rating re-price (`gate.rerate`, `gate.py:50-61`) | The stored products, priced now, give the stored amount (stale or altered amounts, wrong arithmetic) | That the stored form state yields those products; that the products are what was asked |
| Request fidelity (`gate.request_issues`, `gate.py:83-93`) | The saved card holds the requested intent and product identities | What Edit will do |
| Page encode-time checks (`replay.encode_card`, `replay.py:107-140`; `priced_elsewhere` `:101-104`) | The page built the card from the requested form state, in the requested region and mode | The saved card's round trip and the Edit path |
| **Edit view** | The page's own code, run on the saved card, derives the same products and price | Request fidelity; whether a rare path (other currency, locale) behaves the same |

Defect classes that **only** the Edit view caught in this repo's history:

- **Form state that does not reproduce the products.** ECS data disks missing from the render
  template: a card stored at 10,480.39 re-priced to 9,831.28 on Edit, while stored products and
  rating agreed (`docs/explanation/huawei/edit-vs-list-price.md`). The negative control in ADR-0001
  (data-disk entries removed) went from 132.22 to 114.22.
- **Wrong control ids or tokens.** EVS and Direct Connect used ECS quantity labels; the form came
  back different from Edit (`publish-gate.md`, "What the gate found first"; commit `bdd507e`).
  Tokens from another region made Edit price a SKU that does not exist (`card-rules.md`).
- **Controls the page restores differently.** OBS pay-per-use size refilled as 0; `hcss` Edit
  re-priced 11.40 and 120.97 against 3.50 and 42.00 stored; `dsc` on-demand Edit did not restore
  the period (ADR-0001, the seventeen-service table). SFS Turbo capacity rules (`page-encoder.md`).
- **Quantity collapse.** ELB, CCI and APIG have no quantity stepper; a stored quantity above 1
  collapses to 1 on Edit (`openspec/specs/huawei/card-encoding/spec.md`, "One card per unit").
- **Missing template lines.** OBS cards without the per-class `download_*_external` line let the
  page substitute a default (issue #2, second finding). Rating of the stored lines passes.
- **Uneditable cards** (no `rewriteValue`, L8077).

What the other checks catch that Edit does not: NaN and shape faults, stale amounts, wrong
request, and a card the page built in the wrong region. Those stay where they are.

## Failure modes of the current check

"Detected today" is about the current `edit_check` plus `gate`. IDs are for reference.

| ID | Mode | How it manifests | Detected today? | Proposed detection |
|---|---|---|---|---|
| N1 | Final state changes after `converged()` read it, before Save | Save stores a state other than the one matched | Partly: only through the amount | Compare the saved cart item, both directions |
| N2 | Leaked extra state from an earlier card | Extra non-empty keys in the form | No (`store.py:359-377` ignores extras); caught only if the amount moves | Symmetric comparison; fresh context per card |
| N3 | Equal total, different products | Offsetting or zero-priced lines | No | Product identity comparison; re-rate the saved products |
| N4 | Stored-empty control filled by a default | Page default not in the stored card | No (empties skipped, same as the page) | Product identity comparison |
| N5 | Stale `fixedSelectedInfo` saved under this card's id | Previous card's payload | Mostly yes (needs two identical cards to slip) | Saved `timeTag` newer than the Edit click and equal to the board's |
| N6 | Stored and Edit agree but the card is not what was asked | Wrong spec, quantity or region | Not by Edit; by `request_issues` at publish only | Require the expected cards for any publish; for `edit-check <list>` report "fidelity unchecked" |
| N7 | Defect only visible when cards are edited in sequence | Right in a fresh context, wrong after another card | Seen as a failure today | Report as informational second pass |
| N8 | Wrong button matched by substring | `has_text` is a substring match (`edit_check.py:43`); "Edit" or "Save" inside another label | Unknown | Match the exact label; assert one match |
| P1 | Slow refill reported as drift | 20 s elapse while the form still fills (`edit_check.py:112-115`) | It is reported as a failure | Settled proof; else `load_failed` |
| P2 | Failed inquiry for an intermediate state, sent after `mark()` | Sticky failed generation (`driver.py:118-120`) | It is reported as a failure | Count only failures for the final `timeTag` |
| P3 | Load flake | Page, Edit button, View Details, Save timeouts | Reported as a failure; whole list deleted | `load_failed` plus retries in a new context |
| P4 | Leak from earlier card fails a right card | Same as N2, seen as a mismatch | Reported as a failure | Fresh context per card |
| P5 | Type-strict comparison | `"6"` against `6` (offline run) | Reported as a failure | Use `same_value` semantics in the comparison |
| P6 | Portal defect, stored price right | OBS pay-per-use, DMS Kafka yearly | Reported as a failure (correctly blocks; no way through) | Known-defect table |
| P7 | Card not editable | No `rewriteValue` | "Edit button did not respond" | Distinct reason |
| P8 | Save disabled (zero amount or illegal value, L56541) | "Save did not respond" | Reported as a failure | Distinct reason |
| P9 | Rounding at a cent boundary | Totals differing by less than 0.01 but rounding apart | Reported as a failure | Compare unrounded amounts within 0.005, or accept (negligible) |

## Experiment protocols (not run)

All anonymous: no login, nothing saved to the account. Each needs a share link or a seeded cart.
To avoid writing to the owner's account, seed the cart in a fresh context the way
`experimental/bun/src/core/edit-check-browser.ts:47-77` does (card JSON, no list), or have the
owner save one synthetic list once and delete it afterwards. Use synthetic cards only.

**E1. Timeline of one Edit.** Instrument a fresh-context Edit of one card for ECS monthly, EVS,
OBS package, Kafka, NoSQL. Record, with a monotonic clock: page open, View Details, Edit click,
each rating request with its `timeTag`, each response, catalog requests, the moment
`originData.timeTag` equals the board's, the moment the form matches, the `.tiny-loading` mask
present or absent, the Save button's `disabled` state, the time of Save and of the saved item.
Also record every non-GET request. 20 repetitions per service. Decides: the values of `F` and `c`;
whether the predicate in section 2 fires before the 1.5 s window ends; which of the unconfirmed
signals (spinner, Save enablement) are usable; whether Save writes anything outside the page.

**E2. Settle predicate against ground truth.** Same flow, but after the predicate holds keep
observing 10 s (form state, tag, amount, saved card). Any change after the predicate is a
failure of the predicate. At least 100 Edits over at least 5 services. With 0 failures in `N`
trials the 95 percent upper bound on the failure rate is about `3/N` (rule of three), so 100 gives
3 percent and 300 gives 1 percent. Decides whether the predicate may replace the quiet window.

**E3. Parallel scaling and verdict stability.** One fixed set of 30 synthetic cards. Workers
`W` in 1, 2, 3, 4, 6; 5 repetitions each. Record wall time, `load_failed` rate by cause, any
HTTP 429/5xx, and, per card, whether the verdict equals the `W = 1` verdict (it must). Also run
shared-context against fresh-context at `W = 1` and compare per-card verdicts and leak events.
Decides: default `W`, whether fresh-per-card is the default verdict path, the retry budget.

**E4. Seeded cart against View Details.** For cards across at least 8 services, compare the cart
item produced by View Details on a real share link with the item produced by seeding (stored
JSON, then the Edit steps). Decides whether seeding may be the fast path.

**E5. Reproduce the known defects.** Fresh context, 10 repetitions each for OBS pay-per-use and
the Kafka yearly card. Record the mismatch paths, the Edit amount, whether the offline model
predicts it to the cent, and the dialog. For Kafka, find the cause by serving a local copy of
`framework.js` with trace statements through `page.route` (the method issue #2 describes) and
check whether a cascade clears a pending rewrite. Decides the table entries and whether the
Kafka entry can have a cause.

**E6. Retry policy under injected faults.** Use `page.route` to abort or delay a few percent of
requests. Run a known-good card 100 times and a known-bad card (the ADR-0001 negative control)
100 times. Required: no `ok` for the bad card in any run; no `drift` for the good card in any
run (any would be a classification hole); every injected fault ends as `load_failed` or is
retried to the correct verdict. Decides whether the settled proof is strong enough to trust
`drift`.

## Not verified

- No live run of anything. Timings of the page load, the 15 s per card, the 27 s for three
  cards and the flake rate of 1 in 100 come from docs, commits and issue #5. The first two
  disagree and I did not reconcile them.
- The runtime behaviour of the Vue app. I read the code; I did not execute it. In particular: why
  the first emission is partial (the "No data matched" race), whether `valueWatcher` leakage is the
  actual mechanism of the card-to-card leak, and what the card's Save button's enablement rule is.
- The `.tiny-loading` selector and whether a mask is present exactly while a refill is pending.
- That `timeTag` never collides (two emissions in the same millisecond) and that every service
  uses the `template-render` path. Other component families have their own `changeNextStatus`
  copies (L37423, L40572, L40714, L41025, L41299); I read the `template-render` and
  `commonSetup` ones, not the others.
- The cause of the Kafka yearly mismatch (issue #4). The Kafka config has cascaded chains, which
  makes the same mechanism plausible, nothing more.
- Server side: per-anonymous-session state, rate or per-IP limits, the effect of N parallel page
  loads on the portal. Whether Chromium shares an HTTP cache between contexts.
- That Save in the Edit view never calls a write endpoint (E1 checks).
- Behaviour in other languages, currencies (the check opens USD, `edit_check.py:148`) or
  viewports, and lists larger than the page's cart limit (the page disables Add to List at 99
  cards, L56668; the effect on View Details was not checked).
- The `lean` effect on the Edit verdict, and the 15 percent claim in `browser.py:37`.
- Which framework versions the two portal defects exist in. Only 11.4.201 was read; the live
  page served it on 2026-11-02.

Sources not in the repo: the downloaded bundle, `vueRelated`/`tinyVue` chunks and service
configs sit in a scratch directory; fetch them with `scripts/fetch_bundle.py`
([how to](../how-to/fetch-bundle.md)). Playwright and Vue pages cited inline.
