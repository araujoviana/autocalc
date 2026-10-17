# huawei/saved-lists Specification

## Purpose

Create, read and manage saved Huawei calculator lists and their share links, and catch broken lists before a customer sees them.

## Requirements

### Requirement: Only write endpoints need a session
`share/add`, `share/list`, `share/update`, `share/delete`, `share/copy` and `formExport` SHALL
require a session. Catalog, rating, currency and `share/detail` SHALL NOT.

#### Scenario: Read someone's link while logged out
- **WHEN** no session exists and a caller reads a share link
- **THEN** the list is returned

### Requirement: Saved-list lifecycle
The system SHALL create a list from cards (`share/add`) and return its id and share link
`calculator.html?shareListId=<id>&currentCurrency=<CUR>`. It SHALL also list the account's
lists, rename (read + update), duplicate (`share/copy`, optional rename) and delete lists by id
or share URL.

#### Scenario: Create and share
- **WHEN** a list is created with currency BRL
- **THEN** the returned URL ends with `shareListId=<id>&currentCurrency=BRL` and opens without login

#### Scenario: Accepts URL or id
- **WHEN** a caller passes a full share URL to rename, duplicate, delete or read
- **THEN** the id is extracted from `shareListId=` and used

### Requirement: Saved-list validation
`autocalc validate <id>` SHALL read a list anonymously and report: non-finite values
(NaN/undefined/Infinity as values, not substrings), missing required card or product fields,
products with productNum ≤ 0, selectIndex not 0..n-1, RI cards missing selected-level
aggregates, and card or list totals off by more than 0.02 from the sum of their parts.

#### Scenario: Broken RI card
- **WHEN** a saved RI card lacks `perAmount` at the selected level
- **THEN** validate reports it and `ok` is false

#### Scenario: Word containing "nan"
- **WHEN** a label contains "Governance"
- **THEN** validate does not report a NaN
