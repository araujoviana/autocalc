# Spec Delta

## Purpose

Make sure a share link handed to a customer shows, on the website itself, the price autocalc
stored, and leave nothing behind when it does not.

## ADDED Requirements

### Requirement: A link is returned only after three checks pass
After saving a list, the system SHALL re-read it anonymously, validate it and compare every
card's stored amount with a fresh rating-engine price to the cent, and SHALL open each card's
Edit view and compare the amount the page recomputes with the stored one to the cent. It SHALL
return the link only when every check passes for every card.

#### Scenario: All cards agree
- **WHEN** a list of cards is published and each card's stored, rated and Edit amounts are equal
- **THEN** the link is returned with the per-card amounts

#### Scenario: Settlement by monthly price
- **WHEN** a list is published with settlement by monthly price
- **THEN** the same three checks run and the link is returned only if they pass

### Requirement: A failed check deletes the list and reports each card
When any check fails, the system SHALL delete the saved list and SHALL raise `GATE_FAILED`
whose details give, per card, the stored amount, the rated amount, the Edit amount where known,
and the reasons. No link SHALL be returned.

#### Scenario: Edit price differs
- **WHEN** a card's Edit view recomputes a different amount than the stored one
- **THEN** the list is deleted and the error lists that card with both amounts

#### Scenario: Rating differs
- **WHEN** a card's stored amount differs from the rating engine's price for its products
- **THEN** the list is deleted and the error lists that card with both amounts

### Requirement: The gate fails closed
When a check cannot run, such as the browser not starting or a card's Edit view not opening in
time, the system SHALL treat it as a failure, delete the list and raise `GATE_FAILED`. It SHALL
NOT return a link for a card it could not check.

#### Scenario: Edit view cannot be read
- **WHEN** a card's Edit view does not open
- **THEN** that card is reported as failed with the reason and no link is returned

#### Scenario: Deletion fails
- **WHEN** the gate fails and the list cannot be deleted
- **THEN** the error names the list id so the user can delete it by hand

### Requirement: Keeping a failed list is an operator choice
Setting `AUTOCALC_KEEP_ON_FAIL=1` SHALL keep a list that failed the gate and SHALL say so in
the error with the list id. No tool or CLI argument SHALL offer it.

#### Scenario: Debugging
- **WHEN** a list fails the gate with `AUTOCALC_KEEP_ON_FAIL=1` set
- **THEN** the list remains and the error names its id

### Requirement: EVS and Direct Connect cards match the portal's own
Cards for EVS and Direct Connect SHALL carry `calc_5_` and `calc_6_` as the quantity labels in
both the form state and the card's purchase quantity, as the calculator's own cards do.

#### Scenario: EVS card passes the Edit check
- **WHEN** an EVS card is published
- **THEN** the page's form state after Edit matches the stored one and the gate passes
