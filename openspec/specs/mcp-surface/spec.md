# mcp-surface Specification

## Purpose

Give an AI agent everything it needs to turn "price X for customer Y" into a correct Huawei
Cloud quote and share link through MCP tools that describe themselves and are hard to misuse.

## Requirements

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

### Requirement: Read tools never need auth
Discovery, pricing and `read_price_list` SHALL work with no session. Only the tools that write to
or list the user's account SHALL need one.

#### Scenario: Logged-out quote
- **WHEN** no session exists and the agent calls `quote` or `read_price_list`
- **THEN** the call succeeds

### Requirement: Auth errors tell the agent what to do
A write tool called without a valid session SHALL fail with `AUTH_EXPIRED` and a hint. The agent
SHALL be able to call `auth_login`, which opens the browser and blocks up to 5 minutes, and then
retry without further prompting.

#### Scenario: Logged out create
- **WHEN** `publish_quote` is called with no session
- **THEN** the result is `AUTH_EXPIRED` with a hint to call `auth_login` or run `autocalc login`

### Requirement: Errors are structured
Tool failures caused by the calculator or by invalid input SHALL be returned as a structured
payload with `error` (code), `message`, and `hint` and `details` when known, so the agent can act
on the code instead of parsing prose.

#### Scenario: Unknown flavor
- **WHEN** `publish_quote` is called for a draft with an ECS flavor not sold in the region
- **THEN** the result has `error: "SPEC_NOT_FOUND"` and a hint naming the closest flavors

### Requirement: Capability matrix is live
`supported_services` SHALL return, from the builder registry itself, each buildable service with
its supported modes and description. `describe_service` SHALL combine this with the region's
availability and catalog groups.

#### Scenario: New builder registered
- **WHEN** a builder for a new service is registered
- **THEN** `supported_services` lists it without any documentation change

### Requirement: Friendly regions in every tool
Every tool that takes a region, including the requirements of `draft_quote`, SHALL accept the
friendly names defined in the region-availability capability.

#### Scenario: Draft in Santiago
- **WHEN** `draft_quote` gets a requirement with region "Santiago"
- **THEN** the card is built for `la-south-2`

### Requirement: Reading any shared list
`read_price_list` SHALL accept a share URL or id, read it anonymously and return the list name,
total and a normalized row per card (service, region, mode, title, amount, products with spec,
quantity, size and amount), so an agent can inspect or rebuild lists other people send.

#### Scenario: Colleague's link
- **WHEN** the agent passes a share URL received from someone else
- **THEN** it gets the normalized summary without logging in

### Requirement: Quote workflow prompt
The server SHALL offer a `quote_workflow` prompt: collect requirements, `draft_quote`, ask the
user to settle every requirement that was not auto-confirmed, `revise_quote`, show the totals,
call `publish_quote` only after the user agrees, then reply with the link and a table. It SHALL
state the units (GB, Mbit/s, 730 h = one month).

#### Scenario: Prompt retrieval
- **WHEN** the client requests the `quote_workflow` prompt
- **THEN** it returns those steps and units

### Requirement: Destructive tools are explicit
`delete_price_list` SHALL delete only the list named by the given id or URL, and its description
SHALL tell the agent to confirm with the user first.

#### Scenario: Delete
- **WHEN** the agent calls `delete_price_list` with a share URL
- **THEN** exactly that list is deleted and its id is returned

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

### Requirement: Published cards are encoded by the page
`publish_quote` SHALL publish the cards the calculator page builds, not the Python builders'
cards, for every service on the verified list (builder or form recipe). The chosen spec is
taken from the option the service names for it; services priced by usage, and recipe services,
take none. Any other service SHALL be refused before anything is saved, naming the verified
services. A card the page cannot encode SHALL fail with `PAGE_ENCODE_FAILED` and save nothing.

#### Scenario: Verified service
- **WHEN** a draft with a verified service is published
- **THEN** its card is encoded on the page and passes through the publish gate

#### Scenario: Unverified service
- **WHEN** a draft contains a service that is not on the verified list
- **THEN** `publish_quote` fails with `VALIDATION` naming the verified services, and nothing is saved

#### Scenario: Page cannot encode
- **WHEN** one of the cards cannot be encoded by the page
- **THEN** `publish_quote` fails with `PAGE_ENCODE_FAILED` naming the field, and no list exists afterwards

### Requirement: A recipe service says when it ignores the chosen spec
When a draft decision for a recipe service names a spec, `publish_quote` SHALL add a warning
that the spec was not applied and that the card uses the requirement's options and the page's
defaults.

#### Scenario: Recipe service with a chosen spec
- **WHEN** a draft with a recipe service and a decided spec is published
- **THEN** the result's `warnings` names the service and the spec that was not applied

#### Scenario: Service that applies its spec
- **WHEN** a builder service with a `spec_arg` is published
- **THEN** no such warning is added

### Requirement: Tools that drive a browser work over MCP
Every tool SHALL run off the server's event loop so that tools using a browser (`publish_quote`,
`auth_login`) complete when called by an MCP client.

#### Scenario: Publish over MCP
- **WHEN** an MCP client calls `publish_quote` for a decided draft
- **THEN** the list is saved, checked and its link returned, as from the CLI
