# Compatibility audit, 2026-11-07

Frontend 11.4.201, region sa-brazil-1 unless stated. Read-only: nothing was saved on the account; the live
page was driven anonymously. Raw data (catalogs, page-state dumps, replay logs) was kept in the session scratchpad.

## Verdict

"Supported" in `autocalc supported` means *the card passed the gate for one tested configuration*. It does not mean the
service's billing modes and options are covered. OBS is the clearest case: of the page's four storage classes, two
product types and two billing families, only part of three classes is reachable, and **warm, cold and every multi-AZ
usage card fail when replayed on the real page**.

## Method

1. Catalog inventory: `productInfo` for all 97 calculator services (billing modes, usage factors), 20 regions for OBS.
2. Page truth for OBS: drove the live form through every billing mode × product type × storage class × redundancy
   (`obs-states.ts`) and recorded the visible controls and ranges.
3. Replay: built OBS cards with `buildCard`, pushed their form state into the real page with `encodeCard`, compared
   the page's card with the builder's (`obs-replay.ts`).
4. Probed the card schema with 22 OBS inputs for what it accepts or rejects silently.

## OBS: what the page offers vs. what we support

| Page feature | Builder / schema | State |
|---|---|---|
| Packages, monthly and yearly (single-AZ storage) | `package` option | Works live (10 TB monthly, yearly: page card equals builder card) |
| Packages, multi-AZ (`obs.storage_3AZ.*`, packageType `dataInfo_10_`, sold in 8 of 11 package regions) | Not selectable; `multi_az: true` with `package` is accepted and silently priced single-AZ | **Silent wrong price** |
| Outbound-traffic package size (50 GB to 300 TB) and pull-traffic package (`dataInfo_12_`) | The 50 GB package is hard-coded, when the region sells it | Not configurable |
| Packages 400 TB, 500 TB, 1 PB, 10 PB (some regions); warm packages `obs.warm.storage.*` | Not reachable (`obs.storage.<n>` only; docs list up to 300 TB) | Gap |
| Package name validation | `package: "7tb"` passes the schema and fails only at build | Late error |
| Usage, standard single-AZ | `size` + egress, CDN, CRR, get, put, delete | Works live (all 7 lines equal) |
| Usage, standard multi-AZ | `multi_az: true`, `size_3az` | **Fails live**: `no control calculator_multiAZ_radio_Stepper_1` |
| Usage, warm (Infrequent Access), single and multi-AZ | `storage_class: warm` | **Fails live** (see bugs 1 and 2) |
| Usage, cold (Archive) | `storage_class: cold` | **Fails live** (same) |
| Parallel File System (`calc_30_`): `pfs_size`, requests, egress | Not supported | Missing |
| Restore type for Archive (Expedited, Standard, Direct reading) | Hard-coded Expedited; `restore_size_sd`, `retrieval_size_cold` rejected | Missing |
| Storage duration stepper (1 to 12 months) | Fixed at 1; `periods` rejected for on-demand | Cannot quote N months of storage |
| Image processing stepper | Not supported | Missing |
| Quantity 1 to 99 | Forced to 1 | By design |
| Regions that rename classes (ru-moscow-1 uses Warm/Cold, `dataInfo_25_`/`26_`) | Tokens hard-coded to `dataInfo_3_`/`1_` | Wrong tokens there ([display tokens](../explanation/huawei/display-tokens.md)) |
| 35 to 57 usage factors in the catalog | 18 reachable | The rest are free lines or unreachable |

### Bugs found (reproduced live)

1. **Step order.** `buildObs` writes the request, restore and capacity steppers into the form state before
   `storageType_switch` and `multiAZType`. `cardSteps` replays in key order, so for warm, cold and 3-AZ the page has not
   yet shown the controls when the driver types into them. Standard single-AZ works only because its controls exist by default.
2. **Delete and transition are swapped** (`src/core/services/obs.ts`, the `steps` table). The page's
   `Request_stepper4` is *delete requests* (measure 31, per 1,000) and `Request_stepper5` is *lifecycle transition
   requests* (measure 14, per 10,000). The builder sends `transition_*` to stepper4 (as `value / 10000`, so 85 becomes
   0.0085, which the page rounds to 0) and `delete_warm`/`delete_cold` to stepper5. The products (`components` table)
   use the right measures; only the form state is swapped. The real corpus card
   `tests/fixtures/corpus/0865b3a0380911f1b441cb5fd260a270.json` confirms the page's own assignment.
3. **Multi-AZ group order.** Inside `calculator_multiAZ_radio`, `multiAZType` is assigned after the stepper keys, so
   `UNSET_Stepper_1` is typed before the 3-AZ option exists.
4. **The known-defect skip hides these.** The circuit breaker skips the Edit check for every on-demand OBS card
   (`GH-2-OBS-STORAGE-EDIT-DROP`). That defect is real for storage reset on Edit, but the cases above fail earlier,
   at replay, and the offline tests cannot see them: `audit-regressions.test.ts` checks the built card shape against a
   synthetic catalog, never against the page.
5. **Unit mix.** `get`/`put` are per 10,000, `*_warm`/`*_cold` per 1,000 and `transition_*` are raw counts, all under
   one `value` field with no unit in the schema. Values above 9,999 on a stepper pass the schema and fail on the page
   (probe: `get` 20000 accepted).

## Other services: billing modes

Catalog modes (sa-brazil-1) that we do not offer. Presence in the catalog does not prove the page sells it, so each row
is a to-verify, not a confirmed gap.

| Service | We offer | Catalog also has |
|---|---|---|
| apm | ondemand | yearly |
| cci | ondemand | monthly, yearly |
| dew | ondemand | monthly, yearly, one-time |
| hrds | monthly, yearly | ondemand |
| redis | monthly, yearly | ondemand |
| maas | ondemand | monthly, yearly |
| sfs | ondemand | monthly, yearly |
| waf | ondemand | monthly, yearly |
| dsc, ssa | monthly/yearly, ondemand | the other modes |

Coverage of builder options by page controls (`schema coverage`, from the roadmap): ecs, eip, redis, sfs 100%;
dline 67; evs 57; cbr, nat 50; cce, cci, obs 44; apig, dew 43; kafka 40; rabbitmq 36; function, waf 33; rds 31; apm,
lts 30; elb 21; nosql 20. Roadmap item 7b (record which configurations passed live) is still open, so none of these
percentages says what works.

Unsupported entirely: 47 of the 97 calculator services have no entry (e.g. aom, cdm, cbh, dli, dws, mrs, modelarts, search,
workspace, hcss). 11 more have an entry that is blocked from publishing (aad, cc, dbss, dsc, edgesec, esw, ga, hecs,
reliability, ssa, ucs). 40 are publishable. Some services return 403 for the CDN catalog in this region (not sold there).

## Roadmap vs. reality

- Roadmap states "every row delivered" and items 1, 3, 5 as done or partly done; item 3 (per-field limits) lists OBS
  requests as open, and this audit shows the request units are the least of OBS's problems.
- `status.md` and the `v1-scope` page say OBS is covered; the Edit check passes "with known-defect skip". Neither
  mentions that warm, cold and multi-AZ were never replayed live.
- Wave tests (offline) pass (545 tests), which is the problem: they validate shape, not the page.

## Suggested order

1. OBS replay harness as a permanent live test (`obs-replay.ts` is the seed): every class × AZ × package × billing mode, with distinct values per line so swaps show.
2. Fix bugs 1 to 3 (reorder form state: product/storage/AZ first; swap stepper4/5; `multiAZType` first in its group), re-run.
3. Reject `package` + `multi_az` and unknown package names in the schema; then add 3-AZ packages and traffic-package options.
4. Add PFS, restore type and storage duration (needs page-state work per class; `obs-states.ts` lists the controls).
5. Make roadmap item 7b real for every published service, then repeat this audit for the next-most-used services (ECS, RDS, Redis, ELB, EVS).
6. Settle the unit convention for request lines (raw counts in the schema, converted in the builder).
