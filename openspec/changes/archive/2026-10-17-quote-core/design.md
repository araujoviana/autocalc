# Design

## Context

See proposal.md for the why. What exists today:

- `Calculator.skus(service, region)` lists a service's catalog with USD list prices per billing
  mode (`Sku.prices`), and `client._parse_compute` reads vCPUs and memory out of a description.
- `Availability` answers "is the service sold here, and in which modes" and raises actionable
  errors (`ServiceNotSold`, `ModeNotOffered`) that name alternatives.
- ADR-0005 fixes the ranking order and the auto-confirm rule. ADR-0009 fixes the run record.
  ADR-0015 fixes the shape: a core with model, ranking, draft store, run records and a
  `Provider` protocol, plus a `HuaweiProvider` that wraps the existing modules.
- `auth.data_dir()` is where per-user state lives (`AUTOCALC_DATA` overrides it).

## Goals / Non-Goals

**Goals:**

- A core that `workflow-surface` can call without knowing Huawei.
- Ranking and auto-confirm that are pure functions, testable without a network.
- Every decision recorded with who and why, from the first line of code.

**Non-Goals:**

- Totals, rating a draft, publishing, the tool surface, RI, AWS (see proposal).

## Decisions

### D1. Plain dataclasses, JSON by hand
`Requirement`, `Candidate`, `Decision` and `Draft` are frozen/plain `dataclasses` with
`to_dict`/`from_dict`. Prices are `Decimal` in memory and strings on disk, so a round trip is
exact. No pydantic: the models are small and never validated from untrusted input in this
change. *Alternative: pydantic models.* They'd add little here and make the disk format
implicit.

### D2. A requirement is minimums plus an optional pin
`Requirement(id, service, region, billing, quantity=1, needs={"vcpus": 4, "memory_gb": 16},
spec=None, az=None, group=None)`. `needs` holds numeric minimums by name, so the ranking has no
idea what a vCPU is; `spec` pins an exact SKU; `group` narrows the catalog group; `az` is
carried and ignored by `HuaweiProvider` for now. Region is per requirement, so a draft spans
regions without a special case.

### D3. Ranking is one sort key
`rank(req, candidates)` returns `Ranked(candidate, covers, exact, reason)` ordered by
`(not covers, closeness, price, -generation, spec)`. `covers` means every minimum is met and
present. `closeness` is the sum over minimums of `(has - need) / need` (`has` when `need` is 0),
so smaller is closer and a size-up always loses to an equal fit. `exact` means covers with every
minimum equal and, when `req.spec` is set, the same spec. Only `ranked[0].exact` makes a
requirement auto-confirmable; if several are exact the sort already put the cheapest, then the
newest, first, and the reason says so ("cheapest of 3 exact matches"). Non-covering candidates
stay in the list, last, so a human can still pick an undersized option knowingly.
*Alternative: drop non-covering candidates.* ADR-0005 lets the human own every compromise, and a
hidden candidate can't be chosen.

### D4. Reasons are built from numbers, not prose
A reason is assembled from the compared values: `"covers 4 vCPU/16 GB; cheapest of 3 exact
matches"`, `"covers 4 vCPU/16 GB with +16 GB memory; closest of 4"`, `"misses 4 vCPU (has 2)"`.
No adjectives. The same string is stored as the justification of an auto decision.

### D5. Drafts are one file each, written atomically
`DraftStore(root)` saves `drafts/<id>.json` by writing a temp file in the same directory and
`os.replace`, which is atomic on Windows and Linux. Ids are `d-` plus 8 random hex digits.
`load` of an unknown id raises a `ValidationError` naming the id. `list` sorts by file mtime,
newest first. Drafts are small and local, so no index or lock is needed (ADR-0010: writes that
touch only local state per draft need no coordination).

### D6. Run records are JSONL, append-only, one per draft
`RunRecord(root, draft_id)` appends one line per event with `fh.write(line + "\n")` in append
mode, flushing each time, so a crash loses at most the last line. Events: `requirement`,
`candidates` (spec, price, reason, in rank order), `decision`, `step` (name, `ms`). `step` is a
context manager that records in a `finally`, so a failing step is still timed. The record file
is named after the draft id, so one quote has one record. `read()` returns the events as dicts.

### D7. Provider protocol has one method
`Provider.candidates(req) -> list[Candidate]` (name attribute too). Availability checks happen
inside it, because what "offered" means is the provider's business. Publishing, encoding and
the gate join the protocol in the changes that need them. *Alternative: define the full
protocol now.* That would freeze guesses about `publish-gate` and `spa-encoder`.

### D8. `HuaweiProvider` is a thin wrapper
It calls `Availability.check_mode`, then `Calculator.skus`, keeps SKUs that match `group` (when
given) and have a price for the billing mode (a named `spec` is not a filter: it only makes that
SKU the exact match, and the others stay as alternatives), reads vCPUs/memory with
`_parse_compute`, derives `generation` from the digits in the family prefix (`c7n.large.2` is 7;
no digits is 0), and returns `Candidate`s with `Decimal(str(amount))`. Billing outside
on-demand, monthly and yearly is a `ValidationError` before any network call. The existing
modules aren't edited.

### D9. `draft_quote` is a function, not a tool
`core.draft_quote(provider, customer, requirements, store, data_root)` creates the draft, and
for each requirement records the requirement and its top 20 ranked candidates (with the total
count), auto-decides on an exact top match,
and saves. `core.decide(...)` records a human decision, after checking that the spec is among the recorded
candidates, and saves. They are plain functions so
`workflow-surface` can wrap them in the registry unchanged.

## Risks / Trade-offs

- **Ranking by a sum of relative excess.** Two minimums are weighed equally; a candidate that
  oversizes memory by 4x and one that oversizes vCPUs by 4x tie. Fine for ordering a short list
  that a human confirms; revisit if real quotes show a bad order.
- **Generation from the spec name is a heuristic.** It works for ECS-like families and is 0
  elsewhere, which only affects the last tie-break.
- **Dataclasses can drift from the on-disk format.** The round-trip test in tasks 2.1 guards it,
  and a `version` field on the draft file leaves room to migrate.
- **No lock on a draft file.** Two writers could overwrite each other. Drafts are used by one
  person at a time; atomic replace prevents corruption, not lost updates.
