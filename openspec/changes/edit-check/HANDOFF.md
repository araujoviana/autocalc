# Handoff: edit-check (work in progress)

Written 2026-10-22 so the work can resume on another machine. Delete this file when the change is archived.

## Where things stand

Change: `openspec/changes/edit-check/` (proposal, 3 spec deltas, design, tasks; `openspec validate edit-check --strict` passes).
Tasks: **0 of 10 ticked** in `tasks.md`, but part of group 1 is written without its tests. Do not trust the
checkboxes as the status; use this list.

| Task | State |
|---|---|
| 1.1 pure logic | Code written in `src/autocalc/edit_check.py` (result model, line diff, `judge`, `run_cards`, `format_report`). **No tests yet.** |
| 1.2 ECS public-IP rule | Code written in `src/autocalc/validate.py` (`check_ecs_public_ip`, tokens `EIP_ASSIGN`/`EIP_NONE`). **No tests yet.** Existing builder cards already agree with it. |
| 1.3 HTTP 413 | `PayloadTooLarge` in `errors.py`; mapped in `Session._call` in `share.py`. **No test yet.** |
| 2.x browser check | **Not started.** Recipe below. |
| 3.1 CLI `edit-check` | Not started. |
| 3.2 `doctor` session probe | Not started. |
| 4.x docs / specs sync | Not started. |

Existing offline tests pass (`uv run pytest -m "not live"`), `ruff check src` is clean. Nothing has been run against the live
calculator from the new module, because the browser half does not exist yet.

## What the research established (all observed live, frontend `CBC-PortalCalculator/11.4.201`)

- The calculator is a Vue 3 app. Cart state is the Pinia store `cartInfo` (reach it with
  `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('cartInfo')`).
- **Edit re-prices from `rewriteValue.template_RENDER` only.** `valueWatcher` is runtime state and is not saved. Missing form
  state falls back to page defaults. Measured, `sa-brazil-1`, pay-per-use, 4 vCPU/8 GiB ECS:
  - card built with EIP "not required", stored 0.18688; with the EIP keys removed from `rewriteValue`, Edit gives **0.32738**
    (the default 5 Mbit EIP comes back);
  - a data disk present only in `productAllInfos` is ignored by Edit; present in `rewriteValue` as
    `calculator_evs_stepper_|addible0|_0` it counts (0.35208);
  - changing `cpu` or the system-disk size in `rewriteValue` changes the Edit price and the form;
  - an unavailable `generation` silently snaps to an available one.
- Form tokens: EIP switch `calculator_eip_switch.UNSET_Switch` is `calc_14_` (assign) or `calc_15_` (not required); with "not
  required" there is no `calculator_eip_radio`.
- The image control (`calculator_ims_select`) is stored by the page for some flavors (e.g. 8 vCPU/32 GiB, AlmaLinux) and `null`
  for others. Removing or altering it did not change the Edit price in the ECS cases tried. **Not shown to explain any price drift.**
- Anonymous hydration works (no login, no write): see the recipe. The page's own login hand-off stores a pending cart in
  IndexedDB `keyval-store` / object store `keyval` / key `tempShareList`, value `{value: {...}, expire: null}`, and loads then
  deletes it on the next page load. Reloading a second time finds it already consumed.
- Saved lists persist only `buyUrl`, `rewriteValue`, `selectedProduct`, `coverPriceInfo` per card (`langPack` is stripped).
- `share/add` returned **HTTP 413** for a 149-card list; 76 cards was accepted. The real limit is unmeasured and probably request
  size, not card count. Hence no numeric limit in the code.
- `cpqjwt` belongs to an external CPQ flow (`goCPQ` push to `quoting_item`); it is not a replacement session. Static reading of
  the bundle only, not tested live. The roadmap row about it should probably be dropped.
- The calculator currency table had BRL last updated 2026-10-04, the others the same day. USD-only stays (ADR-0004).

## Recipe for the browser half (task 2.x)

Per card, in a **fresh headless context** (not the login profile):

1. `goto` the calculator page (`wait_until="load"`, then wait ~4 s; `networkidle` is flaky because of analytics).
2. In the page, build items with the page's own action, then write them to IndexedDB (stripped card = keys above, plus a
   `langPack` the page can use; the page builds it from `cartInfo.QUERY_GLOBALLANGUAGE()` / `languagePack`):

   ```js
   const pin = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
   const cart = pin._s.get('cartInfo'), g = pin._s.get('globalInfo');
   cart.MODIFY_CARTLISTDATABASE({action: 'init', originData: cards, monthModeTag: false,
                                 currencyData: g.currencyData, currentCurrency: 'USD'});
   const val = {cartListDataBase: JSON.parse(JSON.stringify(cart.cartListDataBase)),
                totalCartPrice: JSON.parse(JSON.stringify(cart.totalCartPrice)),
                cartTitleIndex: {ecs: 1}, isEditingShareList: false, monthModeTag: false};
   // then indexedDB.open('keyval-store') -> put({value: val, expire: null}, 'tempShareList') in store 'keyval'
   ```
3. `goto(URL + "?tempShareList=true#/<serviceCode>")` once. Do not reload.
4. Remove first-run overlays (`.guide-dialog, .tiny-dialog-box__wrapper, .v-modal, .privacy-popup`), they block clicks.
5. Register a `response` listener for `inquiry/resource`, click `button.collapse-card-item-header-operation-item` with text
   "Edit", wait for a rating response, settle ~2 s, use the **last** request/response. `response.json()["amount"]` is the exact
   Edit amount; `judge()` in `edit_check.py` compares it and the request lines with the card.
6. Any failure becomes `EditCheckUnavailable(reason)`, never `ok`.

The harness used for the research lived in a scratchpad that does not travel (`edit_gate.py`, `edit_bug.py`); the JS above is
the core of it. To get a realistic card, build one through the UI (select region by clicking `#calculator_region`, then the
option text; pay-per-use; vCPU/memory buttons; "Not required" for EIP; then `#rshema_func_priceboard_addToList`) and read
`cartInfo.cartListDataBase`.

Open points for the implementer:
- Cards from `share/detail` have no `langPack`; the research used cards that still had it. Confirm `init` works without it, or
  rebuild `langPack` the way the page does (`{global, measureID, custom, ...languagePack[serviceCode]}`).
- Concurrency: each worker needs its own `sync_playwright()`; start with 1 to 2 workers.
- Only ECS was exercised. Other services must report `unavailable` unless proven.

## Login and sessions (not part of this change, but affects testing)

- `autocalc doctor` says "logged in" from cookie age. In this session the server rejected (`CBC.0101 user invalid`) sessions the
  doctor called valid; a later login worked (`share/list` returned 200). Cause not established. Hypothesis, untested: a newer
  login invalidates older sessions, and several processes share one `~/.config/autocalc/session.json`. Task 3.2 addresses the
  doctor part.
- Headless relaunch of the persistent browser profile was not logged in (`isLogin` false) even when the stored cookie header
  worked. Silent refresh from the profile may be unreliable. Not investigated further.
- Another Claude session was creating lists on the same account while this work happened. Avoid launching the login profile
  while a run is active.

## How to resume

```bash
git fetch && git switch edit-check
uv sync --group dev --group docs
uv run pytest -m "not live"       # should pass
uv run ruff check src
openspec instructions apply --change edit-check --json
```
Next: write tests for 1.1 to 1.3 (use `httpx.MockTransport` for the 413 test), tick those boxes, then the browser module.
Process rules from `openspec/config.yaml`: no client data in the repo; every task states how it is verified; USD only.
