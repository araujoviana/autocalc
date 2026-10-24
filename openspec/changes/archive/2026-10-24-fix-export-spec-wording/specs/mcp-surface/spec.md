## MODIFIED Requirements

### Requirement: Export lists to a spreadsheet
`export_quotes_xlsx` SHALL take rows of `{env, list}` (an environment name and a share URL or id),
each optionally with a `draft_id`, and a path ending in `.xlsx`, read each list anonymously and
write the workbook described in "Fixed sheet layout". It SHALL return the path, the row count and
the summed total.

#### Scenario: Two environments
- **WHEN** the agent exports `prod` and `dev` lists to `quotes.xlsx`
- **THEN** the Quotes sheet has a header, a `prod` row, a `dev` row and a Total row, and each link opens its list

### Requirement: Fixed sheet layout
The workbook SHALL have these sheets in this order, each with a bold header row, the columns below
in that order, and rows in input order:

- **Quotes**: Environment, Calculator (the list's name), Total (USD, a number), Link (a clickable
  share URL, wrapped in its cell), then a Total row that sums the totals.
- **Decisions**: Environment, Requirement, Service, Region, Billing, Quantity, Chosen spec,
  Decided by, Justification.
- **Resources**: Environment, Calculator, Service, Region, Billing, Resource, Spec, Quantity,
  Storage (GB), vCPUs, RAM (GB), Price (USD): one row per priced resource of every list. A backup
  line shows its size in the Storage (GB) column.
- **Totals**: Environment, Instances, vCPUs, RAM (GB), Storage (GB), Backup (GB), Total (USD):
  one row per row of the input, then a Total row, with a note on what is not counted. Backup (GB)
  is kept apart from Storage (GB) here.

#### Scenario: Layout
- **WHEN** a workbook is exported
- **THEN** the sheets are Quotes, Decisions, Resources, Totals, with the columns above

#### Scenario: Resource totals add up
- **WHEN** a list has 3 servers of 4 vCPUs and 8 GB RAM, each with a 40 GB disk
- **THEN** Resources shows quantity 3, vCPUs 12, RAM 24 and storage 120 for those lines, and Totals shows instances 3, vCPUs 12, RAM 24, storage 120

#### Scenario: Backup size
- **WHEN** a list has a 200 GB backup vault
- **THEN** its Resources line shows 200 in Storage (GB), and Totals shows 200 under Backup (GB) and nothing added to Storage (GB)
