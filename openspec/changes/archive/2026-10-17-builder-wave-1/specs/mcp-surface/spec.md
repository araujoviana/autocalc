# mcp-surface delta

## MODIFIED Requirements

### Requirement: Published cards are encoded by the page
`publish_quote` SHALL publish the cards the calculator page builds for the decided options,
not the Python builders' cards. It SHALL accept every service on the verified list, taking the
chosen spec from the option the builder names for it (services priced by usage take none), and
SHALL refuse any other service before anything is saved, naming the verified services. If the
page cannot encode a card, it SHALL fail with `PAGE_ENCODE_FAILED` and save nothing.

#### Scenario: Verified service
- **WHEN** a draft with a verified service is published
- **THEN** its card is encoded on the page and passes through the publish gate

#### Scenario: Unverified service
- **WHEN** a draft contains a service that is not on the verified list
- **THEN** `publish_quote` fails with `VALIDATION` naming the verified services, and nothing is saved

#### Scenario: Page cannot encode
- **WHEN** one of the cards cannot be encoded by the page
- **THEN** `publish_quote` fails with `PAGE_ENCODE_FAILED` naming the field, and no list exists afterwards
