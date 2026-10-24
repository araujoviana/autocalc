## ADDED Requirements

### Requirement: Export lists to a spreadsheet
`export_quotes_xlsx` SHALL take rows of `{env, list}` (an environment name and a share URL or id)
and a path ending in `.xlsx`, read each list anonymously and write one sheet. It SHALL return the
path, the row count and the summed total.

#### Scenario: Two environments
- **WHEN** the agent exports `prod` and `dev` lists to `quotes.xlsx`
- **THEN** the sheet has a header, a `prod` row, a `dev` row and a Total row, and each link opens its list

### Requirement: Fixed sheet layout
The sheet SHALL have a header row, then one row per input row in input order, with the columns
Environment, Calculator (the list's name), Total (USD, a number) and Link (a clickable share URL,
wrapped in its cell), then a Total row that sums the totals.

#### Scenario: Layout
- **WHEN** a sheet is exported
- **THEN** the columns are Environment, Calculator, Total (USD), Link, in that order

### Requirement: No partial sheets
If any list cannot be read, the export SHALL write nothing and name the environment that failed.

#### Scenario: One list is gone
- **WHEN** one of the lists cannot be read
- **THEN** the call fails with a `VALIDATION` error naming that environment and no file is written
