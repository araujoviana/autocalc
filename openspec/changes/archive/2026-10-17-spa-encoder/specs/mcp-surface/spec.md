# Spec Delta

## ADDED Requirements

### Requirement: Published cards are encoded by the page
`publish_quote` SHALL publish the cards the calculator page builds for the decided options,
not the Python builders' cards, and SHALL accept ECS, EVS, RDS and SFS Turbo requirements. If
the page cannot encode a card, `publish_quote` SHALL fail with `PAGE_ENCODE_FAILED` and save
nothing.

#### Scenario: Page cannot encode
- **WHEN** one of the cards cannot be encoded by the page
- **THEN** `publish_quote` fails with `PAGE_ENCODE_FAILED` naming the field, and no list exists afterwards
