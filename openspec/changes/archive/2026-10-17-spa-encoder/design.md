# Design

## Context

The PoC recipe for ECS addresses each control by id. The builders already know each service's
form state (`rewriteValue.template_RENDER`), and the page offers every value the builder uses
through the same control ids. 

## Decisions

### D1. Replay the builder's form state
`card_steps` flattens `global_*` and `template_RENDER` into `Step(id, "auto", value)`. A nested
key that starts with its parent's id is already a full id (`calculator_evs_stepper_main`); other
keys join with `_`. A `UNSET_Stepper_n` leaf maps to the control `…_Stepper_n`; a
`measureValue` dict is the stepper's number. A row key matching `…_|addible0|_<n>` adds one
click before its leaves. The builder stays the one place that resolves catalog tokens.

### D2. The form decides the kind
`auto` asks the page what the control is (`base-radio-group` → radio, `base-select` → select,
`base-stepper`, `base-radio-stepper`, `common-input` → stepper). Any other kind fails with the
control's name, so a new control type is a visible failure, not a silent skip.

### D3. Hidden controls
If a control is not visible, the step is skipped only when the form state already equals the
wanted value (compared as numbers when both parse). Otherwise it fails as "no control".

### D4. Two checks beyond the read-back
A stepper is confirmed from the form state when the control is a template control. After
capture, every control asked for must hold the asked value in the page's card (numerically
equal), else `PAGE_ENCODE_FAILED` step `form`. Cosmetic differences from the builder
(`transRate`, label tokens) are ignored: the comparison is control → value only.

### D5. `publish_quote` encodes on the page
Builders resolve options into a card (as today); `encode_card` replays its form state; the
page's card goes to the gate. Cards are encoded in parallel (max 3 browsers). The call is a
module function in `workflow.py` so tests replace it. No fallback to the builder card.

## Risks

- A frontend change breaks replay for a service: the encode fails, nothing is published.
- A builder form state the page cannot hold (SFS Turbo 500 GB) now fails at encode time with the
  field named, where it used to save a card that Edit would re-price.
