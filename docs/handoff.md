# Handoff (2026-11-04, 16:55)

## Priority from the user
These services must work as soon as possible, because a real project needs them: **DCS Redis, EIP, LTS, FunctionGraph, CFW, VPN, VPC Endpoint, HSS**. MaaS must also work.

## State of the priority services
| Service | State |
|---|---|
| Redis | Works, verified live (monthly and yearly). |
| EIP | A builder exists but publishing is blocked ("defaults only"). Map its options to the page controls, then verify live. Page controls: `calculator_ipQuantity_stepper_Stepper_0` (quantity), `calculator_eip_radio_Stepper_0` (bandwidth), `calculator_eip_radio_type_shareType`. |
| LTS | A builder exists, publishing blocked: retention, hot/cold storage and transfer mapping and prices are unverified. |
| FunctionGraph | A builder exists, publishing blocked: compute and request mapping and prices are unverified. |
| CFW, VPN, VPC Endpoint, HSS | **In progress, uncommitted.** Recipes were added in `src/core/services/forms.ts` and `RECIPE_SPEC_FIELDS` / `PRIMARY_GROUP` entries in `publication.ts`. They have NOT been verified live. |
| MaaS | Done and committed (`f2f4237`). Hong Kong (ap-southeast-1) only, beta, on-demand, usage in million tokens. Live: 362.60, stored = rated = Edit. |

## Where the four new recipes stand
- Options: vpcep `duration_hours`; hss `edition` (+ quantity); cfw `edition`, `bandwidth_mbps`, `eips`; vpn `eip1_mbps`, `eip2_mbps`, `spec`.
- Spec fields are empty (like sfs/sdrs/er), so the **edition option and the spec must agree**; the gate catches a mismatch.
- Live test files are in the scratchpad `.../scratchpad/net/{vpcep,hss,cfw,vpn}.yaml`, run by `net/run.sh` one at a time (parallel publishes overload the page). The outputs may not exist if the run was interrupted. Re-run with `bun src/cli.ts apply-quote --path <file>`.
- Open question: VPN's `19_bgp` is an EIP SKU, so the VPN spec choice needs checking. The vpn page also has connection groups, mode and edition controls that are not mapped yet.
- Still to do for each: run the plan, run the live publish, and fix mismatches (stored = rated = Edit). Update the schema yaml files (`src/schema/files/{vpcep,hss,cfw,vpn}.yaml`: add `option:` names to the controls), because the schema-invariant tests will fail until then. Then run `bun test`, `bun run check`, `bun run check:boundaries`, and commit.
- Delete any leftover `[autocalc]` test price lists on the account (check names first; only those).

## Live results at 16:54
- **VPC Endpoint: passes** (`vpcep.basic`, 100 h, sa-brazil-1: stored = rated = Edit = 1.40).
- **CFW: passes** (`cfw.professional`, `edition: detail_11_`, monthly: 1485.00 on all three prices).
- **HSS: not yet.** `edition: dataInfo_6_` is the *advanced* edition on the page, so spec `hss.version.premium` was rejected. Map the editions (dataInfo_1_, 6_, 4_, 3_, 5_) to the specs and retry.
- **VPN: not yet.** The card resolved to spec `vpn`, not `19_bgp`. Use `spec: vpn` and check which SKU the page really prices (the gateway/connection SKU, with EIP bandwidth as options).
- Two passing test lists named `[autocalc] n-vpcep` and `[autocalc] n-cfw` are still on the account. Delete them (check the names first).
- The four schema yaml files are not updated, so `bun test` will fail on the schema-invariant tests until they are. This work was pushed as-is because of the deadline.

## Other repo state
- `package.json` is 0.3.0. The last git tag is v0.1.4. Nothing is tagged.
- Remaining plan items (see `docs/roadmap.md`): OBS depth (request/traffic limits, tiered splitting), builder option coverage, DEW/WAF reserved pricing, SSA add-ons, `docs/status.md` update, GitHub tidy.
- Standing rules: do not close or comment on GitHub issues without the user's go-ahead. Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Xk2ebcsnFwnXMj8UVfk92n`.

## Update (after the first handoff)
Verified live (stored = rated = Edit): VPC Endpoint 1.40, CFW 1485.00, HSS (basic 1.50, premium 13.80, wtp 150.00, container 42.20), VPN 499.00 (spec `19_bgp`, brazil, `eip1_mbps`/`eip2_mbps` 5), EIP 180.00 (spec `19_bgp`, 2 IPs x 10 Mbit/s, monthly). HSS now has a plan-time edition/spec rule. Still blocked: LTS and FunctionGraph. Their old builders no longer fit the page (LTS: no control `calculator_ltsStorage_stepper_Stepper_0`; FunctionGraph: Add to List stays disabled), so they need page-control recipes.

## Final update
FunctionGraph (0.80, 500 x10k requests, 256 MB) and LTS (558.64, 100 GB/day, 30 days retention) now pass live via page-control recipes (stored = rated = Edit). All 8 priority services (Redis, EIP, LTS, FunctionGraph, CFW, VPN, VPC Endpoint, HSS) are verified. Open: the `[autocalc] n-*` test lists still on the account (check names, delete only those); LTS cold storage and hot retention are not options in the recipe yet; VPN connection groups/mode/edition are not options yet.

## Option coverage update
Verified live and added: LTS cold storage (`cold_enabled: calc_3_`, `total_retention_days`, `hot_retention_days`; 590.26), VPN gateway `spec` (dataInfo_300_/dataInfo_1000_) and `connection_groups` (671.50 for 1000 / 20 groups). Tried and dropped (not verified): VPN `mode` (dataInfo_21_: failed price inquiry), `network_type` (dataInfo_15_: the page does not hold the form state), `non_fixed_ip` (dataInfo_18_: stored = rated 709.00, but the Edit page never loaded, twice), `shared_bandwidth` (control absent). EIP traffic billing and HSS advanced are still not tested live.
