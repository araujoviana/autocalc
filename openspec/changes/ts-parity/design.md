## Context

Python (`src/autocalc`, ~3k lines of modules plus `services/`, `page/`, `core/`) is the released
implementation (ADR-0016). `origin/bun-migration-review` holds `experimental/bun/`: 120 `.ts`
files, all 22 service builders, CLI and MCP entry points, an offline test suite. It forks from
`main` at `a21722b` and is 8 commits behind. Measured gap (tool registry and module scan):

| Area | Python | Bun tree |
|---|---|---|
| Read tools (catalog, search, quote, compare, read list, manage lists, auth) | 17 | 17 (+ `create_price_list`) |
| `draft_quote`, `revise_quote`, `publish_quote`, `list_drafts`, `inspect_draft`, `recover_draft` | yes | no |
| `export_quotes_xlsx` | yes | no |
| Core: ranking, draft store, run records, `Provider` | `core/`, `providers/` | no |
| Page replay, driver, controls, store (form-only path) | `page/` | `page.ts`, `edit-check*.ts` only |
| Publish gate (`gate.py`), update notice, frontend drift | yes | partial (`update` hits only) |

The existing OpenSpec specs are behavior contracts and already language-neutral, so they are
the parity definition. Only `dev-quality` and `distribution` name Python tooling.

## Goals / Non-Goals

**Goals**
- Port behavior, not code shape: TypeScript idioms are fine, observable behavior is not negotiable.
- Reach cutover with no regression in what the share link says versus the website's Edit page.
- Keep Python releasable until the parity gate passes.

**Non-Goals**
- Improving page-interaction robustness during the port. A faithful port first; the redesign
  is a separate change on the new base (otherwise parity cannot be measured).
- Reorganizing Python further. It is frozen except for bug fixes that are also ported.

## Decisions

**D1. Branch from `main`, merge the Bun branch in, do not cherry-pick.** The Bun history is
only two commits and carries its tests. Merging preserves them and puts the work on current
`main`. Alternative: restart from scratch, rejected (22 builders and 46 unit tests already work).

**D2. The specs and the Python test suite are the parity oracle.** Each Python test file is ported
to a Bun test of the same scenario, not rewritten from memory. A script dumps both tool
registries (name + JSON schema) and diffs them. Alternative: eyeball comparison, rejected
because the gap is only visible mechanically.

**D3. Follow Python's form-only publication path; drop `create_price_list`.** ADR-0016 says
publication uses a form-only builder path and legacy full-card builders stay for compatibility
and research. The Bun tree still publishes full cards via `create_price_list`. In TypeScript
the full-card builders stay as corpus and research tools only, and `publish_quote` replaces
`create_price_list`. Alternative: keep both entry points, rejected: it would reintroduce the
non-fidelity path ADR-0016 forbids.

**D4. Keep on-disk formats readable by both implementations.** The browser profile (ADR-0011),
the draft store and run records use the same directory layout and JSON shapes, so users keep
their session and open drafts across cutover, and both implementations can be tested against
one profile. Alternative: new formats, rejected: forces re-login and loses drafts for no gain.
Cost: a format change needs a change to both sides until Python is removed.

**D5. Port in dependency order, each step shippable behind tests:**
core → workflow → page replay + gate + `publish_quote` → remaining tools → parity gate →
distribution → cutover. Each step ends with its ported tests green and the registry diff
shrinking.

**D6. Distribution is decided separately (ADR-0019), before cutover.** ADR-0013's `uv tool`
path cannot serve a Bun tool. Candidates: a compiled single binary (`bun build --compile`) per
OS attached to a git tag, or `bun install -g` from the repository. The choice affects
`install.sh`/`install.ps1` and the update notice, and the `distribution` spec delta waits for
it. Not decided here.

**D7. The card schema and quote files are the shared contract.** `card-schema` (done first) makes the
service schemas, quote-file fixtures and lock format language-neutral. The port reads the same YAML
and fixtures instead of re-deriving option lists from Python builders, so builder porting shrinks to
what the schema does not yet map. Alternative: port builders first, rejected: it would copy the
duplication the schema removes.

## Risks / Trade-offs

- **Silent price drift in a ported builder** → the golden-corpus Edit check runs on both sides
  for every verified service in the four verification regions (ADR-0015) before cutover; any
  mismatch blocks (see `dev-quality` delta).
- **Bun on Windows differs from Linux** (profile lock, paths, process spawn) → the CI matrix
  keeps `ubuntu` and `windows`; the profile-lease tests already in the Bun tree run on both.
- **Dual maintenance while porting** → Python is frozen to bug fixes; each fix lands in both
  or is logged in `tasks.md` as a known gap. The window is bounded by cutover.
- **Playwright behavior differs between language bindings** → live region sweep on both
  implementations, compare per-combination outcomes (Python: 300/300 in primary regions).
- **Private corpus is gitignored** → the parity gate needs a stored session and corpus on the
  maintainer's machine; CI runs only the offline half (ADR-0016: no private fixtures in CI).

## Migration Plan

1. Port and verify on a `ts-parity` branch; Python stays on `main` and keeps releasing.
2. Run the parity gate locally with session and corpus, and in CI for the offline half.
3. Decide distribution (ADR-0019), build installers, dry-run on a clean Windows and Linux VM.
4. Cutover change: move `experimental/bun/*` to the repo root, delete `src/autocalc`,
   `pyproject.toml`, `uv.lock`, Python tests; update CI, installers, docs; tag the first TS release.
5. Rollback: Python remains reachable at the last pre-cutover tag; the shared on-disk formats
   (D4) mean a user can go back by reinstalling that tag.

## Open Questions

- `.xlsx` export: Python uses only the standard library. The TypeScript tool will need a small
  zip writer or one dependency; either keeps the same sheet layout. Decide when porting task 5.1.
- Whether the first TS release is `0.2.0` or `1.0.0`. Cosmetic; decide at tagging.
