# Spec Delta

## Purpose

Give an AI agent everything it needs to turn "price X for customer Y" into a correct Huawei
Cloud quote and share link through MCP tools that describe themselves and are hard to misuse.

## ADDED Requirements

### Requirement: Tool inventory
The MCP server `hwc-calculator` SHALL expose discovery tools (`list_services`, `list_regions`,
`describe_service`, `supported_services`, `search_skus`), pricing tools (`quote`,
`convert_currency`, `compare_modes`, `compare_regions`), list tools (`create_price_list`,
`read_price_list`, `list_my_price_lists`, `rename_price_list`, `duplicate_price_list`,
`delete_price_list`) and auth tools (`auth_status`, `auth_login`).

#### Scenario: Tool listing
- **WHEN** an MCP client lists tools
- **THEN** all seventeen tools above are present with descriptions that state units and defaults

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
- **WHEN** `create_price_list` is called with no session
- **THEN** the result is `AUTH_EXPIRED` with a hint to call `auth_login` or run `autocalc login`

### Requirement: Errors are structured
Tool failures caused by the calculator or by invalid input SHALL be returned as a structured
payload with `error` (code), `message`, and `hint` and `details` when known, so the agent can act
on the code instead of parsing prose.

#### Scenario: Unknown flavor
- **WHEN** `create_price_list` gets an ECS flavor not sold in the region
- **THEN** the result has `error: "SPEC_NOT_FOUND"` and a hint naming the closest flavors

### Requirement: Dry run before publish
`create_price_list` SHALL build and price every card with `dry_run=true` without saving, and
return the name, total, per-card summary (service, title, mode, amount), warnings, settlement
and currency. With `dry_run=false` it SHALL also return the list id and share URL.

#### Scenario: Preview then publish
- **WHEN** the agent calls `create_price_list` with dry_run true, then false with the same items
- **THEN** both return the same totals, and only the second returns `id` and `url`

### Requirement: Capability matrix is live
`supported_services` SHALL return, from the builder registry itself, each buildable service with
its supported modes and description. `describe_service` SHALL combine this with the region's
availability and catalog groups.

#### Scenario: New builder registered
- **WHEN** a builder for a new service is registered
- **THEN** `supported_services` lists it without any documentation change

### Requirement: Friendly regions in every tool
Every tool that takes a region, including the items of `create_price_list`, SHALL accept the
friendly names defined in the region-availability capability.

#### Scenario: Create in Santiago
- **WHEN** `create_price_list` gets an item with region "Santiago"
- **THEN** the card is built for `la-south-2`

### Requirement: Reading any shared list
`read_price_list` SHALL accept a share URL or id, read it anonymously and return the list name,
total and a normalized row per card (service, region, mode, title, amount, products with spec,
quantity, size and amount), so an agent can inspect or rebuild lists other people send.

#### Scenario: Colleague's link
- **WHEN** the agent passes a share URL received from someone else
- **THEN** it gets the normalized summary without logging in

### Requirement: Quote workflow prompt
The server SHALL offer a `quote_workflow` prompt: collect requirements, discover options per
region, dry-run and show totals, publish only after the user agrees, then reply with the link
and a table. It SHALL state the units (GB, Mbit/s, 730 h = one month).

#### Scenario: Prompt retrieval
- **WHEN** the client requests the `quote_workflow` prompt
- **THEN** it returns those steps and units

### Requirement: Destructive tools are explicit
`delete_price_list` SHALL delete only the list named by the given id or URL, and its description
SHALL tell the agent to confirm with the user first.

#### Scenario: Delete
- **WHEN** the agent calls `delete_price_list` with a share URL
- **THEN** exactly that list is deleted and its id is returned
