## MODIFIED Requirements

### Requirement: Fixed sheet layout
The workbook SHALL have these sheets in this order, each with a bold header row, the columns below
in that order, and rows in input order:

- **Quotes**: Environment, Calculator (the list's name), Total (USD, a number), Link (a clickable
  share URL, wrapped in its cell), then a Total row that sums the totals.
- **Decisions**: Environment, Requirement, Service, Region, Billing, Quantity, Chosen spec,
  Decided by, Justification.
- **Resources**: Environment, Calculator, Service, Region, Billing, Resource, Spec, Quantity,
  Storage (GB), vCPUs, RAM (GB), Price (USD): one row per priced resource of every list.
- **Totals**: Environment, Instances, vCPUs, RAM (GB), Storage (GB), Backup (GB), Total (USD):
  one row per row of the input, then a Total row, with a note on what is not counted.

#### Scenario: Layout
- **WHEN** a workbook is exported
- **THEN** the sheets are Quotes, Decisions, Resources, Totals, with the columns above

#### Scenario: Resource totals add up
- **WHEN** a list has 3 servers of 4 vCPUs and 8 GB RAM, each with a 40 GB disk
- **THEN** Resources shows quantity 3, vCPUs 12, RAM 24 and storage 120 for those lines, and Totals shows instances 3, vCPUs 12, RAM 24, storage 120

## ADDED Requirements

### Requirement: Decisions are recorded with the list
`publish_quote` SHALL record which draft produced the list it saved. The Decisions sheet SHALL
list every requirement of that draft with its chosen spec, who decided it (auto or human) and the
justification. A row of the export MAY name a `draft_id` instead. When no draft is known for a
list, its Decisions rows SHALL say so instead of being left out.

#### Scenario: Published list
- **WHEN** a list saved by `publish_quote` is exported
- **THEN** its requirements and justifications appear on Decisions without naming the draft

#### Scenario: List from elsewhere
- **WHEN** a list with no recorded draft is exported
- **THEN** Decisions has one row for its environment saying no draft is recorded
