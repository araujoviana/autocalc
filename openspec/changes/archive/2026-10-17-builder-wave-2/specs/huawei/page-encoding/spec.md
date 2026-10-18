## ADDED Requirements

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
