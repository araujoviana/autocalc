# Design

## Context

- `openspec/specs/` holds six flat capabilities from the 2026-10-15 baseline. All of them except
  `mcp-surface` describe Huawei-only behavior.
- `docs/` holds two hand-maintained files:
  - `CAVEATS.md` (15 sections, each citing a spec as `*Spec: <cap> › <requirement>*`);
  - `BACKLOG.md` (Epics A–E, a capability matrix and milestones). Much of it is done or
    superseded by the plan.
- Decisions from the grilling session live only in the user's local memory and the plan file.
- The OpenSpec CLI (1.14.2) moves requirements between capabilities only through REMOVED +
  ADDED deltas, and archiving leaves a capability with zero requirements behind as an empty
  spec.

## Goals / Non-Goals

**Goals:**
- Every later change can cite an ADR for "why" and a stable capability path for "what".
- The docs build is reproducible and fails CI on broken links or nav.
- No client data enters any new file. Explanation pages are generic.

**Non-Goals:**
- Rewording requirements beyond the two corrections named in the proposal.
- Docs hosting or publishing. The repo stays private until v1, so the site is built in CI and
  previewed locally only.
- Reference docs generated from code. The CLI/MCP reference comes with `workflow-surface`, from
  the tool registry.

## Decisions

### D1. Spec deltas land with the code that makes them true
The plan called this phase `target-specs`, meaning requirements written ahead of the code.
That would make main specs claim behavior the code lacks, because archive merges deltas into
the source of truth immediately. Instead:
- This change only relocates and corrects.
- Target behavior is recorded as ADRs now.
- Each implementing change (`auth-sessions`, `quote-core`, `publish-gate`, …) carries its own
  requirement delta.

The change was renamed `docs-foundation` to match.

Alternatives considered:
- Target specs with a "Status: planned" marker. OpenSpec has no such field, and it would rot
  silently.
- Keeping this change unarchived until v1. That blocks every other change from building on the
  layout.

### D2. Layout: provider-neutral at the top, `huawei/` (later `aws/`) beneath
The flat names (`rating`, `catalog-access`) would collide or turn ambiguous once AWS arrives.
A nested path keeps "what any provider must do" (`mcp-surface`, and later `quote-model`,
`publish-and-verify`) apart from "how Huawei's calculator behaves". This deliberately departs
from the flat layout the baseline started with, and this change exists to do that.

### D3. Move by REMOVED + ADDED, then delete the empty directories
The requirements are generated verbatim from the baseline by a script, so the move is
mechanical and diffable. Only two requirements are hand-edited:
- `huawei/rating` › "Polite, sequential use": the false 429 rationale is replaced. The
  sequential behavior is kept until a concurrency change specifies otherwise.
- `huawei/auth-sessions` › "HWS_INTL_ID authenticates" becomes "Writes use the stored
  session". The cookie bisection result is a vendor observation and moves to
  `explanation/huawei/sessions.md`.

`saved-lists-and-auth` is split by concern:
- the six login/session requirements go to `huawei/auth-sessions`;
- the lifecycle, validation and write-endpoint requirements go to `huawei/saved-lists`.

After `openspec archive`, the five emptied directories are removed in the same commit.

### D4. ADRs: MADR 4 minimal template, numbered, immutable once accepted
The ADRs live at `docs/adr/NNNN-kebab-title.md`, each with frontmatter
`status: accepted | superseded by NNNN` and a date. A superseded ADR is never edited; a new
ADR replaces it. Each ADR cites its evidence: a measurement, a bundle finding or a grilling
answer. The initial set:

| # | Decision |
|---|---|
| 0000 | Record architecture decisions (MADR, Diátaxis, OpenSpec roles) |
| 0001 | Page as encoder: publish by driving the real calculator form; Python encoder only as per-service fallback |
| 0002 | The share link is the deliverable; Excel only on request; fidelity bugs are fatal |
| 0003 | Fail-closed publish gate: anonymous re-read vs rating engine + headless Edit check; delete on failure |
| 0004 | USD list prices only; discounts and currencies out of scope |
| 0005 | Candidate ranking (covers → closest → cheapest → newest); auto-confirm only on exact match |
| 0006 | Refuse the whole request if any item is unsupported |
| 0007 | Workflow surface `draft_quote` → `revise_quote` → `publish_quote`; CLI and MCP generated from one registry |
| 0008 | MCP output: tabular for collections, compact JSON for objects, per-tool token budget (measured 3345 → 794 tokens) |
| 0009 | Traceability: per-quote run records with a justification for every decision |
| 0010 | Concurrency by state: rating reads bounded-parallel, form filling in isolated browser contexts, account writes sequential |
| 0011 | Auth: the persistent browser profile is the credential; prefer system Chrome/Edge/Chromium |
| 0012 | Platforms: Windows and Linux are both first-class |
| 0013 | Distribution: `uv tool install` from git tags via `install.sh` / `install.ps1`; update notice, no silent update |
| 0014 | Saved lists named `[autocalc] <customer> – <date>`, with `prune` |
| 0015 | Strangler migration to a provider-neutral core; AWS is the second provider |

### D5. MkDocs Material 9.7, config kept Zensical-compatible
- mkdocs core has had no release since 2024-08, Material is in maintenance mode, and its
  successor Zensical is still 0.0.x.
- Pin `mkdocs-material>=9.7,<10` in a new `docs` dependency group, and use only features
  Zensical reads from `mkdocs.yml`: nav, admonitions, `pymdownx` superfences/tabbed and search.
  Switching to Zensical later is then a dependency swap plus an ADR.
- `mkdocs build --strict` runs in CI after the tests.
- `openspec/` and `docs/adr/` render as-is. ADRs are linked from nav; specs are linked by
  relative path, not copied.

Tree:
```
docs/
  index.md                      what autocalc is, links into the four quadrants
  tutorials/first-quote.md      install → login → draft → publish (current CLI)
  how-to/                       refresh-corpus.md, fetch-bundle.md, run-tests.md
  reference/                    cli.md (hand-written for now), errors.md
  explanation/
    architecture.md             provider core vs huawei/, specs vs ADRs vs docs
    huawei/                     edit-vs-list-price.md, display-tokens.md, billing-modes.md,
                                regions.md, card-rules.md, catalog-drift.md, sessions.md,
                                concurrency.md
  adr/
```

### D6. CAVEATS split: one generic page per concern
Each CAVEATS section maps to one `explanation/huawei/*` page and keeps its spec citation, with
the path updated to `huawei/…`. "Sizing rules of thumb" is checked for client-specific numbers
and generalized or dropped. "Provider rate limits" is rewritten as `concurrency.md` from
ADR-0010's measurements.

### D7. BACKLOG triage
Each item gets exactly one disposition:
- **done**: dropped, because the baseline specs cover it;
- **planned**: named in a phase change (A* → `auth-sessions`; B* → `spa-encoder`/waves;
  C* → `workflow-surface`; D6/D7 → `distribution`/this change);
- **decided**: becomes an ADR;
- **open**: listed in the change's archive note for the user to file as an issue.

The mapping table goes in tasks evidence, not in a new markdown file.

### D8. `openspec/config.yaml` context and rules
- `context`: USD list prices only; no client data in the repo; Windows and Linux; the share
  link is the deliverable.
- `rules.proposal`: state what is out of scope and the publish-gate impact.
- `rules.specs`: requirements describe observable behavior, vendor observations go to
  explanation docs, and a delta ships with the code that makes it true.
- `rules.tasks`: every task names how it is verified.

## Risks / Trade-offs

- [Archive leaves empty spec dirs] → An explicit task deletes them after archive, and
  `openspec validate --specs --strict` confirms a clean tree.
- [mkdocs/Material maintenance ends] → Zensical-compatible config and an ADR to switch.
  Building docs is not on the product's critical path.
- [ADRs written after the fact can read like rationalization] → Each one cites concrete
  evidence and the date it was decided (2026-10-16), and records the rejected options.
- [Explanation pages leak client data] → Before commit, grep new docs for customer names from
  the local corpus index (run locally; the index never leaves the machine).
