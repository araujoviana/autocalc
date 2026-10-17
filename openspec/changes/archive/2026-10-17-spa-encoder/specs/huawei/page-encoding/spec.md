# Spec Delta

## ADDED Requirements

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
For each supported service and billing mode that the service sells, a page-encoded card, saved
and re-read, SHALL have its stored amount equal its Edit amount and the rating engine's price
for the same products, to the cent.

#### Scenario: Exit matrix
- **WHEN** one card per supported service and billing mode is encoded, saved as one list and re-read
- **THEN** for every card the stored, Edit and rating amounts are equal
