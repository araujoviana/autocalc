# Audit remediation, 2026-10-29

The audit's reproduced price and publication errors are addressed with stricter validation and
fail-closed support. Default-only recipes, LTS publication and FunctionGraph publication remain
unavailable until their controls and prices can be verified. This is a support reduction, not a
claim that those builders have been completed.

The stale cookie backup was deleted. Private notes and the previous private audit were moved to
`~/.local/share/autocalc/private-audit-2026-10-29/` with owner-only permissions. Generated site
content was rebuilt with reports, quotes and private directories excluded. Deleting a cookie
backup does not revoke the remote session; console logout is still needed for revocation.

Python remains canonical (ADR-0016). Existing experimental branches, stashes and worktrees are
retained because deleting them could destroy unpublished work.

## Second remediation pass

Publication now uses a form-only builder path: catalog tokens are resolved without issuing a
throwaway rating request or assembling an intermediate saved card. Replay compares global
quantity, hours and duration as well as service controls. Synthetic public fixture requests run
in offline CI and an anonymous weekly/manual workflow compares page cards with rating without
saving lists. OpenSpec validation runs in CI; its oversized layout requirement was split into a
scenario, and the unapplied-spec warning contract now requires rejection.

Draft publication/revision and index updates use operating-system file locks across processes.
A durable in-progress marker prevents automatic retry after an ambiguous remote save; verified
results persist before index or frontend metadata work. Option-derived cards must contain the
selected catalog spec before they can be saved.
Authentication probes and account requests share headers. Windows documentation describes inherited
profile ACLs rather than claiming POSIX modes protect files on Windows. Exports default to unique
files in the user data directory and refuse overwrite. Driver controls share a single timeout
budget per step. Calculator construction is lazy and performs no network/cache-directory setup.

The regional CCE catalog distinguishes standard `s1`/`s2` from turbo `t1`/`t2`; the unverified turbo
mapping is now rejected. ECS image searches prefer a unique exact name/id and reject ambiguous
substring matches instead of depending on catalog order.

## Deliberately unavailable or deferred

- LTS storage/retention, FunctionGraph compute, CCE turbo and default-only recipes remain blocked
  from publication until verified control mappings and prices are available. Restoring these is
  new service support, not a safe extrapolation from a self-consistent default card.
- The old full-card builders remain for legacy library consumers and golden research; publication
  does not rate or assemble those cards. Removing the compatibility surface needs a migration.
- Rename preserves all fields returned by anonymous detail, but backend completeness cannot be
  proven offline. No alternative full-fidelity read endpoint is established.
- Browser reuse and memory-based concurrency need runtime profiling; deadline limits now bound
  missing-control waits. No performance claim is made from offline tests.
- Experimental branches, stashes and worktrees remain intact to preserve unpublished work.
- List-shaped tool results retain their existing schema and do not carry update notices.
- Revoking the removed cookie's remote session requires console logout.

Offline checks cannot certify live prices or Windows ACL enforcement. The anonymous workflow
provides independent ongoing price-drift evidence without importing a private corpus.

## Third remediation pass

Direct rating requests reject fractional/invalid quantities, nonfinite values, unknown fields,
and invalid terms before catalog work. A rating response must contain exactly one result for
every requested product; partial results cannot silently produce an understated quote.
Comparisons expose hours and periods and normalize multi-period monthly equivalents.

Draft decisions are revised atomically. Existing AZ metadata still round-trips, while new
quotes and publication reject unsupported AZ selection. `inspect_draft` reports pending,
ready, unknown-outcome and published states. After manually reconciling saved lists,
`recover_draft` can reset an unknown outcome only with an explicit no-remote-list confirmation
and a recorded justification. Recovery changes local state only.

OBS rejects conflicting class/factor combinations, duplicate component controls, invalid values,
and ambiguous package/component requests; multi-AZ state is encoded for usage-only cards too.
Rename and copy validate list names before reading or mutating an account.

## Verification evidence

Anonymous synthetic Memcached and Enterprise Router requests both passed page and rating checks
sequentially in the third pass, including requested quantities and controls. Independent page
mounting diagnostics also succeeded. The earlier mounting failures were not reproducible in
this pass. Failure diagnostics now expose only sanitized resource host/type/status and script
exception names, without URLs, query strings, request bodies or exception messages.

These are two live cases, not a full service/region certification. No saved lists were created.

The new LTS cold-retention form also passed anonymous request/page/rating verification (daily
flow 10 GB, index 50%, total retention 60 days, hot retention 30 days, two months). This single
case does not restore saved-list publication support. Discovery now reports explicit publication
support and blocking reasons instead of advertising every registered builder as publishable.

The saved-list gate now rejects empty requests and incomplete/duplicate checker indices. Its
anonymous re-read compares stored form values and product identity/spec/quantity with submitted
cards, in addition to checking prices and Edit behavior.

Final third-pass verification: 336 offline tests passed (135 live cases deselected), Ruff passed,
strict MkDocs build passed, and all 16 OpenSpec validations passed. Live ER and Memcached cases
passed sequentially; the additional LTS cold-retention case passed separately.
