# Page encoder

*Specs: `huawei/page-encoding`*

The page encoder builds a card by filling in the real calculator form and taking the card the
page adds to its own cart ([ADR-0001](../../adr/0001-page-as-encoder.md)). This page records
how the page behaves. Everything here is a vendor observation of frontend
`CBC-PortalCalculator/11.4.201` (2026-10-17), made anonymously. Any release can change it.

## Version

The page loads `https://portal.hc-cdn.com/CBC-PortalCalculator/<version>/framework.js`. The
version in that script URL is what errors and reports carry. `autocalc doctor` and
`scripts/fetch_bundle.py` use the same pattern.

## Reaching the page's state

The page is one Vue 3 app mounted on `#app`. Production builds don't expose
`app._instance`, but the root vnode is on the container (`#app._vnode`), and walking
`component.subTree` from there reaches every component instance.

- **Form state** is the `valueWatcher` prop of the `template-render` component:
  `global_REGIONINFO` (region, AZ type, billing mode), `global_PERIODTIME`,
  `global_ONDEMANDTIME`, `global_QUANTITY`, `global_FEEINSTALLMODE`, and `template_RENDER.value`
  (the per-service form state that saved cards carry). It isn't in a Pinia store.
- **The cart** is the Pinia store `cartInfo`. `cartListDataBase` is an object keyed by
  `_cartId`. Each item holds `buyUrl`, `rewriteValue`, `selectedProduct`, `langPack`,
  `valueWatcher`, `cartData` and `originData`. Saved cards keep only the first three keys.
- **The price board** (`func-priceboard`) keeps its priced result in closure state that
  can't be read from outside. The priced card only becomes readable data once it lands in the
  cart, either through Add to List or through Save after an Edit.

## Form components

Each form control is a component with `props.viewConfig.id` (the config id, for example
`calculator_ecs_radio_generation`), `props.idHeader` (the DOM id, for example
`calculator_ecs_radio_2`) and, where it has options, `props.sourceData`, a list of
`{value, text}`. `value` is the token that ends up in `template_RENDER` (`C7n`,
`dataInfo_43_`). `text` is the English label on the button.

The encoder addresses a control by its **config id**, finds the visible instance with that id,
and maps the wanted token to its label through `sourceData`. Some controls share a config
prefix and only one of them is visible at a time. The EIP bandwidth stepper is one example:
`calculator_eip_radio_Stepper_0/1/2` match the EIP types, and only the one for the selected
type renders.

| Kind | How a value is set | Read back from |
|---|---|---|
| `base-radio-group` | click the `li button` whose label is the option's `text` | the button's `li.active` |
| `base-select` | click the select, then the visible `li.tiny-select-dropdown__item` with the option's `text` (the list renders at the end of `<body>`) | the input's value |
| `base-stepper` | fill the `input.tiny-numeric__input-inner` and press Enter | the input's value |
| `base-region` | open the select and call `click()` on the `.tvp-region__option-content-item` with the region's name. It sits outside the dropdown's scroll area, so a pointer click doesn't reach it | the input's value |
| `common-addible` | a pointer click on `.common-addible-addDisk` once per extra row (a DOM `click()` is ignored) | a new `…_|addible0|_<k>` entry |

The billing-period buttons are the exception: their options carry `activeLabel` and
`noActiveLabel` instead of `text`. `1_20` is 1 month, `2_20` is 2 months, …, and `1_19` is
1 year.

### ECS controls

| Config id | Values |
|---|---|
| `global_REGIONINFO_region` | region name from the menu, for example `LA-Sao Paulo1` for `sa-brazil-1` |
| `global_REGIONINFO_chargeMode` | `PERIOD`, `ONDEMAND`, `RI` |
| `global_PERIODTIME_UNSET_PeriodTime` | `<n>_20` months, `<n>_19` years (`PERIOD` only) |
| `global_ONDEMANDTIME_Stepper_0` | hours, 1–9999 (`ONDEMAND` only) |
| `global_QUANTITY_Stepper_0` | number of servers |
| `calculator_ecs_radio_{arch,vmType,generation,cpu,mem}` | the VM's catalog tokens, in that order: each choice narrows the next |
| `calculator_ecs_RIRadio_{RITime,paymentType}` | `nodeData.1_3` or `nodeData.3_3`; `nodeData.NO_UPFRONT` (`RI` only) |
| `calculator_ims_select___platform`, `calculator_ims_select_name` | image platform, then image name |
| `calculator_evs_stepper_main_type`, `…_main_Stepper_0` | system disk type token and size |
| `calculator_evs_stepper_|addible0|_<k>_type`, `…_Stepper_0` | data disk *k*, after the add button |
| `calculator_eip_switch_UNSET_Switch` | `calc_14_` (assign an EIP) or `calc_15_` (none) |
| `calculator_eip_radio_{eipSpec,shareType,eipType}` | EIP tokens; then `calculator_eip_radio_Stepper_1` for Mbit/s |

The page doesn't preselect an image: until the flavor family has images, the image select is
empty and `template_RENDER` holds `null` for it. The recipe always sets every priced field
explicitly. Form state survives a billing-mode switch.

### Replaying a builder's form state

`autocalc.page.replay` fills the form for any service from a Python builder's card. The
builder's `rewriteValue` says which value each control should hold, so the encoder needs no
per-service recipe: `card_steps` flattens it to `(control id, value)` steps and the form itself
says what each control is (`auto`). A key nested under its parent that starts with the parent's
id is already a full control id (`calculator_evs_stepper_main`). A `UNSET_Stepper_n` leaf is the
control `…_Stepper_n`. A row key `…_|addible0|_<n>` is preceded by one click on the add button.

| Control (`__name`) | Filled as |
|---|---|
| `base-radio-group` | radio |
| `base-select` | select |
| `base-stepper`, `base-radio-stepper` | stepper (the radio part of a `base-radio-stepper` is not used) |
| `common-input` | stepper, then blur: a plain input only commits when it loses focus |

What the page did differently from the builders, seen on the seven services in `sa-brazil-1`:

- **Hidden controls.** The ELB public IP count is hidden for a private load balancer, a
  service may have no quantity stepper, and OBS shows its one package type disabled and already
  ticked. The step is skipped only if the form already holds the wanted value.
- **Rules of the form itself.** SFS Turbo capacity (TB) must be at least 3.6 and a multiple of
  1.2, and only a value the input's own rule accepts is committed. A rejected value leaves the old
  one in the form state while the input box shows the typed text, so steppers are read back from
  the form state, not the box. A text input keeps `'6'` where a builder wrote `6.0`, so values are
  compared as numbers when both parse.
- **Other ids.** In on-demand billing the SFS Turbo form uses `calculator_sfsDemand_radio` and
  `calculator_sfsDemand_36input` where saved cards use the `Type`/`Period` ids.
  `replay.ALIASES` maps them.
- **OBS pay-per-use.** The page encodes a usage card (storage size, traffic, requests) and
  prices it, but its Edit view refills the size stepper (`calculator_multiAZ_radio`) with 0. This
  happens for the builder's card as well, so the Edit check fails and the publish gate refuses
  such a card. OBS packages (monthly, yearly) are Edit-faithful.
- **Cosmetic differences.** The page writes `transRate`/`transTarget` and some label tokens
  differently from the builders. Only control → value is compared, after capture.

## How a card is captured

1. Remove the overlays that block clicks: the first-visit guide (`.guide-dialog`, `.v-modal`)
   and the cookie banner (`.privacy-popup`).
2. Apply the recipe's steps in order and read each one back.
3. Wait until the price is settled: the region's catalog
   (`…/portalcalculatornodeservice/v4/api/productInfo?region=…`) has finished loading, no rating
   request (`…/ratingservice/v2/inquiry/resource`) is in flight, and none was answered in the last
   1.5 s. The page first loads the default region's catalog (`ap-southeast-1`) and fetches the
   chosen region's after the region step; clicking Add to List before that one is read builds
   the card from the default region's products, with the right region still in the form state.
   A card takes 2–4 s. A failed inquiry shows up as an error status or an `exceptionId` in the
   rating response. While the form passes through intermediate states (RI chosen before the
   flavor, or an Edit refill in progress), the page rates states it can't price, and those
   inquiries fail as expected. Only a failure of a request sent for the final form state counts.
   The page's own `…/inquiryfailed` report follows the failed response, so it can't be tied to
   a form state and isn't used.
4. Click **Add to List** (`#rshema_func_priceboard_addToList`) and wait for a new key in
   `cartInfo.cartListDataBase`.
5. Check that every product of that item carries an `inquiryResult` (an unpriced product means
   the inquiry failed), then return the item's `buyUrl`, `rewriteValue` and `selectedProduct`.

For ECS in `sa-brazil-1` (on-demand 730 h, monthly, and 1-year no-upfront RI, two data disks
and 5 Mbit/s), the captured cards had the same `template_RENDER` and the same amounts as the
Python builder's. One difference showed up: the page's `buyUrl` joins data disks with `;`
where the builder uses `,`.

## Edit check

A share link (`calculator.html?shareListId=<id>`) opens a **Price List** dialog. Its **View
Details** button copies the list's cards into the anonymous cart (`cartListDataBase`, same
`_cartId`s). Each card in the cart panel has an **Edit** button
(`button.collapse-card-item-header-operation-item`). Edit loads the card's `rewriteValue` into
the form, and the page re-prices it. The editing card then shows **Save**, which writes the
re-priced card back to its cart entry. The entry's `selectedProduct.timeTag` changes, so a
fresh `amount` can be told from the stored one. No login is involved, and nothing is saved to
an account.

### The "No data matched" warning

After Edit, the page compares the stored `rewriteValue` with the one the form produces while
it refills. On a mismatch it opens a dialog: *"No data matched some of the previously selected
product specifications."* (`closeactionname="rewriteError_close"`). With a page-built card
that re-priced to its exact stored amount, the dialog appeared in about half of the runs,
including after a 6 s wait, and the final form state still equalled the stored one. It looks
like a race in the page's own refill.

So the check doesn't use the dialog to decide. After Edit it compares the stored
`rewriteValue` with the form's final one, using the same rule as the page (empty values in the
stored copy are skipped). A card passes only if that comparison holds *and* the Saved amount
equals the stored amount. Whether the dialog appeared is reported alongside.
