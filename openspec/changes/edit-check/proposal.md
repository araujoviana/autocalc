# Proposal

## Why

A saved card whose stored price differs from what the website's **Edit** view recomputes is the
tool's fatal bug class ([ADR-0002](../../../docs/adr/0002-share-link-is-the-deliverable.md)). Live
research on 2026-10-22 showed the mechanism: Edit rebuilds the form from `rewriteValue` alone and
fills any missing field with the page's default. A card stored without public-IP form state
re-priced from 0.18688 to 0.32738 on Edit, and data disks that exist only in the products are
dropped. Today nothing can detect this before a customer opens the link. The same research found
that `share/add` rejects large lists with an unexplained HTTP 413, and that `autocalc doctor`
reports "logged in" for a session the server has already rejected.

## What Changes

- New `autocalc edit-check <list-id-or-url>`: loads each saved card into the real calculator page
  anonymously, runs Edit, and reports stored amount, Edit amount and the differing product lines
  per card. No login, no write.
- `autocalc validate` gains a static rule: an ECS card's public-IP form state must agree with its
  products.
- A 413 from `share/add` raises a specific `PAYLOAD_TOO_LARGE` error with a split hint instead of
  a raw HTTP dump.
- `autocalc doctor` probes the server with the stored session instead of reporting cookie age, and
  says so when the session is rejected.

## Capabilities

### New Capabilities
- `huawei/edit-check`: anonymous per-card Edit-reprice verification of saved lists.

### Modified Capabilities
- `huawei/saved-lists`: validation covers ECS public-IP form-state agreement; oversized list
  creation fails with a specific error.
- `huawei/auth-sessions`: `doctor` reports whether the server accepts the stored session.

## Impact

- Code: new `edit_check` module and CLI command; small changes in `validate.py`, `errors.py`,
  `share.py` and `cli.py` (`_doctor`).
- Playwright is already a dependency; the check uses the bundled or system Chromium.
- **Publish-gate impact:** none yet. This change delivers the Edit check as a standalone,
  read-only building block. Wiring it into publish with delete-on-failure
  ([ADR-0003](../../../docs/adr/0003-fail-closed-publish-gate.md)) stays with the `publish-gate`
  change, which needs the `quote-core` model first.

## Out of Scope

- Publishing, delete-on-fail and `--keep-on-fail` (`publish-gate`).
- Driving the form to build cards (`spa-encoder`) and any new service builder.
- Fixing the builders that produce drifting cards; this change finds drift, it does not repair it.
- Automatically splitting oversized lists; the error only names the problem.
- Services other than the ones the check can open in Edit; unsupported cards report "unavailable",
  never "ok".
