# Proposal

## Why

v1 (ADR-0015) needs at least half of the quotable Huawei services verified: publishable, with
stored price = Edit price = rating. Seven are today (ECS, EVS, CCE, ELB, OBS, RDS, SFS Turbo,
of 97 services). Thirteen more have Python builders but cannot be published: apig, apm, cbr,
cci, dew, dline, function, kafka, lts, nat, nosql, rabbitmq, waf. Wave 1 verifies those 13.

"Quotable" (the v1 denominator) means a service with a price in the calculator and a form a
quote can fill. Support, consulting and marketplace entries do not count. The first task fixes
the list from the live catalog.

## What Changes

- A builder declares which of its options takes the ranked spec (`spec_arg`), replacing the
  hard-coded `_SPEC_ARG` table in `workflow.py`. Services priced by usage (function, lts, waf,
  dew, cci) have no ranked spec and publish from their options.
- `publish_quote` accepts every service that has a builder and has passed the live matrix.
- The page replay learns whatever control kinds these 13 forms use; an unknown kind still fails
  by name.
- Each verified service is recorded with the calculator frontend version it was verified
  against. `doctor` and `publish_quote` warn when the live frontend version differs, and any
  encode or Edit failure names the service and that version, so a changed page is never silent.
- Live matrix (`tests/support/spa_matrix.py`) gains the 13 services in each billing mode they sell.
- A service whose Edit view cannot reproduce the stored price (like OBS pay-per-use) is
  documented and refused by the gate, not hidden.

## Out of scope

- Databases, storage and networking beyond the 13 (waves 2 and 3).
- New Python builders, and the generic control-description file for services with no builder (wave 2 decides).
- The update notice, AWS, multi-region lists.

## Publish-gate impact

None. The gate is unchanged and still fail-closed; more services pass through it.

## Capabilities

- Modified: `huawei/page-encoding`, `mcp-surface`.
