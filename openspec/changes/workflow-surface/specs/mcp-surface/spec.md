# Spec Delta

## ADDED Requirements

### Requirement: One registry feeds MCP and the CLI
Every tool SHALL be defined once in the tool registry. The MCP server SHALL expose each registry
tool, and the CLI SHALL expose a subcommand per tool whose arguments come from the tool's
signature and which prints the tool's result as JSON.

#### Scenario: Same tool both ways
- **WHEN** a tool is added to the registry
- **THEN** it appears in the MCP tool list and as a CLI subcommand without further code

### Requirement: Draft, revise, publish
The server SHALL offer `draft_quote(customer, requirements)`, which returns a draft id, for each
requirement the ranked candidates and which ones were auto-confirmed (exact matches only);
`revise_quote(draft_id, decisions)`, which records each decision with its justification; and
`publish_quote(draft_id, name)`, which builds the cards from the decisions and publishes them
through the publish gate.

#### Scenario: Undecided requirement
- **WHEN** `publish_quote` is called for a draft that still has a requirement without a decision
- **THEN** it fails with a structured error naming the pending requirement ids and nothing is saved

#### Scenario: Full path
- **WHEN** every requirement is decided and `publish_quote` is called
- **THEN** the result has the list id, URL and per-card checks from the gate

## MODIFIED Requirements

### Requirement: Tool inventory
The MCP server `hwc-calculator` SHALL expose the workflow tools (`draft_quote`, `revise_quote`,
`publish_quote`), discovery tools (`list_services`, `list_regions`, `describe_service`,
`supported_services`, `search_skus`), pricing tools (`quote`, `convert_currency`, `compare_modes`,
`compare_regions`), list tools (`read_price_list`, `list_my_price_lists`, `rename_price_list`,
`duplicate_price_list`, `delete_price_list`) and auth tools (`auth_status`, `auth_login`).

#### Scenario: Tool listing
- **WHEN** an MCP client lists tools
- **THEN** all tools above are present with descriptions that state units and defaults, and
  `create_price_list` is absent

### Requirement: Quote workflow prompt
The server SHALL offer a `quote_workflow` prompt: collect requirements, `draft_quote`, ask the
user to settle every requirement that was not auto-confirmed, `revise_quote`, show the totals,
call `publish_quote` only after the user agrees, then reply with the link and a table. It SHALL
state the units (GB, Mbit/s, 730 h = one month).

#### Scenario: Prompt retrieval
- **WHEN** the client requests the `quote_workflow` prompt
- **THEN** it returns those steps and units

## REMOVED Requirements

### Requirement: Dry run before publish
**Reason**: the draft is the preview; a link can only come from `publish_quote`.
**Migration**: use `draft_quote` and `revise_quote`, then `publish_quote`.
