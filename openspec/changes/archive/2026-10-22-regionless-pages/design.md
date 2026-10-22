## Context

`card_steps` always starts with the region step. Global pages list only the charge mode and
location type, so the step failed with "The form has no control global_REGIONINFO_region".

## Decisions

**D1. Opt-in per recipe.** `regionless` is declared in the recipe, and the form state then carries
no region, so `card_steps` skips the step. Alternative rejected: skip whenever the control is
missing, which would hide a vanished region control on a regional page (fail-closed encoding).

## Risks

- The saved card has no region; the live matrix (stored = Edit = rating) is the check. It passed.
