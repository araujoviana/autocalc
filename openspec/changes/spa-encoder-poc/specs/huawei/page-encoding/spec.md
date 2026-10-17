# Spec Delta

## Purpose

Build Huawei calculator saved-list cards by driving the real calculator page, so each card's
form state comes from the website's own code, and check a saved card's Edit price the same way.

## ADDED Requirements

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
