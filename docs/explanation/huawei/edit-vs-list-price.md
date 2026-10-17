# List price vs Edit price

*Specs: `huawei/card-encoding` › Edit price equals list price; ECS data disks survive Edit*

The saved list, and the anonymous share link, show each card's stored `amount`. Clicking
**Edit** makes the page *recompute* the price from `rewriteValue.template_RENDER`, which is the
form state, **not** from the stored products (`productAllInfos`). Two consequences:

- If the form state is incomplete, or carries a token from another region or catalog, the Edit
  price silently differs from the saved one. Saving after Edit then corrupts the card.
- Every saved card must carry the real form state the page would have produced. This is the
  reason for the page-as-encoder decision ([ADR-0001](../../adr/0001-page-as-encoder.md)).

## Example: ECS data disks

For an ECS card to survive Edit, it needs:

- **one `calculator_evs_stepper_|addible0|_<k>` entry per data disk** (the trailing id only
  has to be unique; real cards use `_0` or `_1`);
- **data-disk products marked `_productType: "addible"`** (only the system disk is `"main"`).

Without them, the editor drops the disks. In one observed case a card stored at 10,480.39
re-priced on Edit to 9,831.28: the VM (9,182.16) plus the system disk (649.12), with both 50 GB
data disks lost.

## Why the offline golden tests miss this

The golden comparison ignores `rewriteValue` and other volatile keys, so a card with a broken
form state still "matches". That is why the publish gate includes a headless Edit check per
card ([ADR-0003](../../adr/0003-fail-closed-publish-gate.md)). Until the gate exists,
`tests/test_template_render.py` and `uv run python -m tests.support.template_audit` cover the
form state.
