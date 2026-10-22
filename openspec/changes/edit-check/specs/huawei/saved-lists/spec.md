# Spec Delta

## ADDED Requirements

### Requirement: ECS public-IP form state agrees with products
`autocalc validate` SHALL report an ECS card whose public-IP form state contradicts its products:
a bandwidth product with no public-IP form state, or public-IP form state that asks for an
address with no bandwidth product. The report SHALL name the card and both sides of the
disagreement.

#### Scenario: EIP-less card with default form state
- **WHEN** an ECS card has no bandwidth product and its form state does not say "not required"
- **THEN** validate reports the card and `ok` is false

#### Scenario: Consistent card
- **WHEN** an ECS card's products and form state both say no public IP
- **THEN** validate reports nothing for that rule

### Requirement: Oversized list creation fails specifically
When the calculator refuses to create a list because the request is too large (HTTP 413), the
system SHALL raise a `PAYLOAD_TOO_LARGE` error stating the card count and advising to split the
list. It SHALL NOT report a generic upstream failure and SHALL NOT retry.

#### Scenario: Large list
- **WHEN** creating a list of 149 cards is refused with HTTP 413
- **THEN** the error code is `PAYLOAD_TOO_LARGE`, it states 149 cards, and its hint says to split the list
