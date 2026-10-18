## Context

`encode_card(service, rewrite_value)` already needs only `global_REGIONINFO` and
`template_RENDER`; the builder's catalog card is discarded and the page's card is returned
(ADR-0001). The driver resolves each control's kind from the page (`auto` steps) and fails with
the offered values when an option is missing. Probes of redis, dds and sfs show each page lists
its controls with `viewConfig.id`, kind and `sourceData` values.

## Decisions

**D1. Recipe = data, builder = one class.** `services/forms.py` holds
`RECIPES: dict[str, Recipe]`; `Recipe` has `controls: {option: control id}` and `fixed:
{control id: value}`. One `FormBuilder` is registered per recipe service and returns
`{"global_REGIONINFO": ..., "template_RENDER": {...}}` from options. Alternative rejected: 13
builder classes that rebuild catalog cards the page already builds.

**D2. Options are the page's own values.** An option's value is passed verbatim to the control
(e.g. `calc_17_`, `100BSSUNIT.pluralUnit.17`). `page-controls` shows them. Alternative
rejected: a friendly-name layer per control, which would be 13 more hand-kept tables that drift
when the page changes. Friendly names can come later for the services that sell well.

**D3. Recipes are checked against the page, not the catalog.** The repo test for a recipe is the
live matrix (WAVE2 in `spa_matrix.py`): stored = Edit = rating per billing mode. A recipe that
cannot pass moves its service to *later*.

**D4. Page changes surface as they do today.** Recipe services use the same `VERIFIED` version
map and warnings; a vanished control fails closed with its id.

## Risks

- Option values are page-internal keys; a frontend release can rename them. Mitigated by the
  version warning and fail-closed encode, not prevented.
- Recipe services publish from `options` only; the ranked candidate for them is ignored (same as
  kafka, cce) until spec mapping is done.
