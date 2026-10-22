## Context

Wave 2 added `Recipe`/`RECIPES`/`FormBuilder` in `services/forms.py` and the live matrix in
`tests/support/spa_matrix.py` (see archived `builder-wave-2`). Wave 3 reuses both unchanged.

## Decisions

**D1. Recipes only, no new builders.** Same as wave 2: data per service, one generic builder.
Alternative rejected: Python builders, which would copy catalog plumbing the page does.

**D2. Probe every billing mode.** `page-controls` shows the default state; on-demand or yearly
modes can expose other controls (sfs did), so probe each mode before writing the recipe.

**D3. Fail to *later*, do not bend the encoder.** A service that cannot pass is moved with a
reason; no per-service hacks in the driver.

**D4. Autonomous run.** The user is away and approved running without review. Work stays local
(commits on `spa-encoder-poc`, nothing pushed).

## Risks

- Security and network pages (cfw, hss, aad) may need quantities or selections that depend on
  other controls → recipe with `fixed` choices, else *later*.
- The Edit check flakes ("The calculator form did not appear") → re-run before judging.
- Option values are page-internal keys → covered by the version warning and fail-closed encode.
