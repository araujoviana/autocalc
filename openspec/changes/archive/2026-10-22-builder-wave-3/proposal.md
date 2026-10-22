## Why

33 of the 93 quotable services are verified; the v1 target is 47. Wave 3 is the next 20, all
networking, security, middleware and Flexus compute (er, ga, esw, vpcep, eip, vpn, cc, cfw, hss,
aad, dbss, cbh, dsc, ssa, ccm, edgesec, reliability, ucs, hecs, hcss). Verifying them reaches 53.
The form-recipe route from wave 2 already exists, so this wave is data plus live runs.

## What Changes

- A form recipe per wave-3 service, written from `autocalc page-controls <service>` (probing
  each billing mode the service sells, since the default page state may hide controls).
- Each service is run live in every billing mode it sells (stored = Edit = rating, non-zero
  prices) and added to `VERIFIED` with the frontend version.
- A service whose form cannot be replayed, or whose Edit price differs, moves to *later* in
  `docs/explanation/v1-scope.md` with its reason, and the counts are updated.
- Services whose pages already hold a Python builder path (none expected) are not touched.

Out of scope: wave 4 or any service outside the list, ranked-spec mapping for recipe services,
multi-region lists, the update notice, the first release tag.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `huawei/page-encoding`: a service that cannot be verified is recorded with its reason.

## Impact

- `services/forms.py` recipes, `VERIFIED`, `tests/support/spa_matrix.py` (WAVE3),
  `tests/test_registry.py`, docs (`v1-scope.md`, `cli.md` verified list, ADR-0001 result table,
  roadmap).
- Publish gate and the encoder: unchanged.
