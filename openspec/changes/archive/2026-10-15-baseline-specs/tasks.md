# Tasks

## 1. Validate the specs

- [x] 1.1 Run `openspec validate baseline-specs --strict` and fix every reported issue; verify it exits 0
- [x] 1.2 Spot-check each spec's examples against live behavior (`uv run autocalc search`, `quote`, region resolution); verify no requirement contradicts what the endpoints return today, and add any contradiction to design.md Known divergences

## 2. Point the docs at the specs

- [x] 2.1 Add a short header to `docs/CAVEATS.md` stating that `openspec/specs/` is the contract and CAVEATS is the rationale, and append a "Spec:" pointer (capability + requirement name) to each section; verify every section has one
- [x] 2.2 Correct the CAVEATS ECS-EIP section to describe the fix (default `None` in both builders since `99fa96d`); verify it matches `src/autocalc/services/ecs.py`
- [x] 2.3 Add a "Specs and changes" section to the README explaining `openspec/specs/`, the propose → apply → archive loop and the `/opsx:*` commands, and mark the coverage numbers as dated; verify the commands listed run (`openspec list --specs` after archive)

## Workflow follow-up

- Archive the change (`/opsx:archive baseline-specs`) so the six specs land in `openspec/specs/`.
- Start `repo-hygiene` from the Known divergences table in design.md.
