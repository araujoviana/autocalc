# huawei/page-encoding Specification

## Purpose

Build Huawei calculator saved-list cards by driving the real calculator page, so each card's
form state comes from the website's own code, and check a saved card's Edit price the same way.

## Requirements

### Requirement: ECS cards are encoded by the page
Given ECS options (region, flavor, billing mode on-demand, monthly or RI, image, system disk,
data disks, bandwidth), the encoder SHALL return the card the calculator page itself adds to its
cart for those options, in the saved-list card shape `{buyUrl, rewriteValue, selectedProduct}`.

#### Scenario: Monthly ECS card with two data disks
- **WHEN** a monthly `c7n.large.2` ECS card in `sa-brazil-1` is encoded with an Ubuntu image, a 40 GB system disk, two 50 GB data disks and 5 Mbit/s bandwidth
- **THEN** the returned card has a `rewriteValue.template_RENDER` with two addible data-disk entries, and its `selectedProduct` lists the VM, image, system disk, both data disks and the bandwidth

#### Scenario: RI ECS card
- **WHEN** a 1-year no-upfront RI ECS card is encoded
- **THEN** the returned card's `selectedProduct` carries the RI aggregates the page computed

### Requirement: Encoding is anonymous and saves nothing
The encoder and the Edit-price check SHALL run without logging in and SHALL NOT open the login
browser profile. The encoder SHALL NOT create, change or delete any saved list.

#### Scenario: No session
- **WHEN** a card is encoded on a machine where `autocalc login` was never run
- **THEN** the card is returned and no saved list exists afterwards that did not exist before

### Requirement: Each run uses its own browser context
Each encode and each Edit-price check SHALL run in a fresh browser context that shares no
storage with another run, so concurrent runs cannot see or change each other's cart.

#### Scenario: Two encodes at once
- **WHEN** two different ECS cards are encoded concurrently
- **THEN** each result holds exactly the card for its own options

### Requirement: Encoding fails closed
When a field cannot be set, a requested value is not offered by the form, the page reports a
failed price inquiry, or no card appears in time, the encoder SHALL raise `PAGE_ENCODE_FAILED`
naming the field or step, and SHALL return no card.

#### Scenario: Flavor not offered
- **WHEN** an ECS card is encoded with a flavor the form does not offer in the region
- **THEN** a `PAGE_ENCODE_FAILED` error names the flavor field and no card is returned

#### Scenario: Price inquiry fails
- **WHEN** the page reports a failed price inquiry for the chosen options
- **THEN** a `PAGE_ENCODE_FAILED` error names the inquiry step and no card is returned

### Requirement: Edit price of a saved card can be checked
Given a share link, the Edit-price check SHALL open each card's Edit view anonymously and SHALL
report, per card, the stored amount, the amount the Edit view recomputes, and whether they are
equal to the cent.

#### Scenario: Faithful card
- **WHEN** the check runs on a list whose card re-prices on Edit to its stored amount
- **THEN** that card is reported with both amounts and as equal

#### Scenario: Edit view cannot be read
- **WHEN** a card's Edit view does not open or does not finish re-pricing in time
- **THEN** that card is reported as failed with the reason, never as equal

### Requirement: Page-encoded ECS cards are Edit-faithful
An ECS card encoded by the page, saved and re-read, SHALL have its stored amount equal its Edit
amount and the rating engine's price for the same products, to the cent, for on-demand, monthly
and 1-year RI billing in `sa-brazil-1`.

#### Scenario: Exit matrix
- **WHEN** on-demand, monthly and 1-year RI ECS cards with two data disks and bandwidth are encoded, saved as one list and re-read
- **THEN** for every card the stored, Edit and rating amounts are equal

### Requirement: Any supported service is encoded from a form state
Given a service and the form state a builder intends (`rewriteValue`), the encoder SHALL fill
the calculator form with that state and SHALL return the card the page itself adds to its cart,
in the saved-list card shape. It SHALL support ECS, EVS, CCE, ELB, OBS, RDS and SFS Turbo.

#### Scenario: Card from a builder's state
- **WHEN** an EVS builder card's form state is encoded
- **THEN** the returned card is the page's, and its stored amount equals the builder's for the same options

#### Scenario: Control the page hides
- **WHEN** the state holds a value for a control the page hides, and the form already holds that value
- **THEN** the control is skipped and the card is returned

### Requirement: The page must hold the state that was asked for
After capture the encoder SHALL compare each control's value in the page's card with the value
asked for, and SHALL raise `PAGE_ENCODE_FAILED` naming the control if any differs. A value the
form rejects SHALL fail the same way and SHALL NOT leave the form's old value in the card.

#### Scenario: Capacity the form rejects
- **WHEN** an SFS Turbo card is encoded with a capacity the page's own rule rejects
- **THEN** a `PAGE_ENCODE_FAILED` error names the capacity control and no card is returned

### Requirement: Page-encoded cards of every supported service are Edit-faithful
For each supported service and billing mode that the service sells (OBS pay-per-use usage cards excepted: the website's Edit view cannot restore their size), a page-encoded card, saved
and re-read, SHALL have its stored amount equal its Edit amount and the rating engine's price
for the same products, to the cent.

#### Scenario: Exit matrix
- **WHEN** one card per supported service and billing mode is encoded, saved as one list and re-read
- **THEN** for every card the stored, Edit and rating amounts are equal

### Requirement: Verified services are listed with their frontend version
The system SHALL keep a list of the services verified for page encoding, each with the
calculator frontend version it was verified against. A service is on the list only after a live
run in which the stored, Edit and rating amounts agreed for every billing mode it sells (or the
mode is documented as unsupported).

#### Scenario: Frontend changed since verification
- **WHEN** the live calculator's frontend version differs from the one a service was verified against
- **THEN** `autocalc doctor` and `publish_quote` say so, naming the service and both versions, and the gate still decides each card

#### Scenario: Encode failure names the version
- **WHEN** the page cannot encode a verified service's card
- **THEN** the error names the service, the failing field or step and the live frontend version

### Requirement: Services without a builder are encoded from a form recipe
For a service that has a form recipe, the encoder SHALL fill the calculator page from the
recipe's control ids and the caller's options, and return the card the page itself builds. A
recipe SHALL name only controls the page lists, and an option the recipe does not know SHALL
be refused before the page is opened.

#### Scenario: Recipe service
- **WHEN** a card for a recipe service is encoded with valid options
- **THEN** the returned card is the one the page added to its cart and holds the requested form state

#### Scenario: Unknown option
- **WHEN** a recipe service is encoded with an option its recipe does not define
- **THEN** a `VALIDATION` error names the option and the page is not opened

#### Scenario: Control disappeared
- **WHEN** the page no longer lists a control a recipe names
- **THEN** a `PAGE_ENCODE_FAILED` error names that control and the frontend version, and no card is returned

### Requirement: A page's controls can be listed
The system SHALL list the visible controls of a service's calculator page (id, kind and option
values), anonymously and without saving anything.

#### Scenario: Listing
- **WHEN** the controls of a service are listed
- **THEN** each control's id, kind and option values are returned, and no saved list is created

### Requirement: Unverified services are recorded with a reason
A quotable service that is not on the verified list SHALL be listed in the v1 scope document
with its status and, when its form could not be replayed or its Edit price differed, the reason.

#### Scenario: Service fails verification
- **WHEN** a live run shows a service's stored, Edit and rating amounts disagree, or its form cannot be replayed
- **THEN** the service is not on the verified list and the scope document lists it as *later* with that reason

### Requirement: Pages without a region control are encoded without a region
For a service whose recipe is marked regionless, the encoder SHALL fill the page without a region
step. For any other service a missing region control SHALL still fail the encode.

#### Scenario: Global service
- **WHEN** a card for a regionless service is encoded
- **THEN** no region is chosen and the page's card is returned

#### Scenario: Regional page lost its region control
- **WHEN** a service that is not regionless is encoded and the page has no region control
- **THEN** a `PAGE_ENCODE_FAILED` error names `global_REGIONINFO_region`

### Requirement: The card must be priced where it was asked
After capture the encoder SHALL compare the region and the charge mode of the card's priced
product with the region and charge mode that were requested, and SHALL NOT return a card whose
product differs. A card that differs SHALL be encoded again, up to three tries in all, and if
none matches the encoder SHALL raise `PAGE_ENCODE_FAILED` naming the region (or the charge mode)
and return no card. For a service whose recipe is regionless no region is requested and none is compared.

#### Scenario: The page prices the card in another region
- **WHEN** the page returns a card whose priced product is in a different region than the one requested
- **THEN** the encoder tries again, and the card it returns is priced in the requested region

#### Scenario: The page keeps pricing in the wrong region
- **WHEN** all three tries return a product in a different region
- **THEN** a `PAGE_ENCODE_FAILED` error names the region and no card is returned

#### Scenario: Regionless service
- **WHEN** a card for a regionless service is encoded
- **THEN** no region is compared and the page's card is returned
