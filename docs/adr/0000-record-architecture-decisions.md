---
status: accepted
date: 2026-10-16
---

# Record architecture decisions

## Context and Problem Statement

autocalc started as ad-hoc code. The reasons behind its rules lived in chat transcripts, a
backlog file and a caveats file, so every new contributor (human or agent) re-argued settled
questions or broke them without knowing. We need one place for *why*, one for *what*, and one
for *how to use it*.

## Considered Options

* Keep everything in long Markdown files (a caveats list and a backlog).
* Put rationale inside the OpenSpec specs.
* Separate the three concerns: OpenSpec specs for behavior, MADR ADRs for decisions, and a
  Diátaxis docs site for learning and reference.

## Decision Outcome

Chosen option: **separate the three concerns**.

| Artifact | Answers | Lives in | Changes how |
|---|---|---|---|
| OpenSpec spec | What must the system do? | `openspec/specs/` | Only through an OpenSpec change, in the same change as the code |
| ADR (MADR 4) | Why this direction, and what was rejected? | `docs/adr/NNNN-title.md` | Never edited after acceptance; superseded by a new ADR |
| Docs (Diátaxis) | How do I use it, and how does it work? | `docs/{tutorials,how-to,reference,explanation}` | Freely, in any commit |

ADRs are numbered and immutable once `status: accepted`. A reversed decision gets a new ADR,
and the old one's status becomes `superseded by NNNN`. Each ADR cites the evidence it rests on:
a measurement, a reverse-engineering finding or a stated requirement.

### Consequences

* Good, because specs stay testable: rationale and vendor observations no longer crowd out
  requirements.
* Good, because future work cites decisions instead of reopening them.
* Bad, because there are three places to look. `docs/index.md` explains which one to use.
