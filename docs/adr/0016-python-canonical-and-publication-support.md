---
status: accepted
date: 2026-10-29
---

# Python is canonical; publication requires request fidelity

The packaged Python implementation in `src/autocalc` remains canonical. Experimental TypeScript
branches are research artifacts, not releases. Fixes found there must be ported and verified in
Python before they count as delivered. Existing branches, worktrees and stashes are retained to
avoid destroying unpublished work.

Publication support means that the requested configuration can be represented by the page form,
not merely that the page accepts its defaults. Unsupported quantities, options and incomplete
pricing paths must fail before saving. Stored/Edit/rating agreement remains necessary but does
not establish request fidelity by itself.

This decision supersedes ADR-0014's mandatory customer-based naming and proposed `prune` command.
Saved-list names remain user supplied; no automatic pruning is implemented. Customer notes and
private audits belong outside the repository and documentation source tree.

Publication uses a form-only builder path; legacy full-card builders remain for compatibility
and research. Synthetic public fixtures and anonymous page/rating checks can run without a
session. Saved-list verification requires a session and must never publish customer data or
private corpus fixtures into CI.
