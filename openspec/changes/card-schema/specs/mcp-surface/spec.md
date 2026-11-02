## MODIFIED Requirements

### Requirement: Tool inventory
The MCP server `hwc-calculator` SHALL expose the workflow tools (`draft_quote`, `revise_quote`,
`publish_quote`), the declarative tools (`plan_quote`, `apply_quote`), discovery tools
(`list_services`, `list_regions`, `describe_service`, `supported_services`, `search_skus`),
pricing tools (`quote`, `convert_currency`, `compare_modes`, `compare_regions`), list tools
(`read_price_list`, `list_my_price_lists`, `rename_price_list`, `duplicate_price_list`,
`delete_price_list`) and auth tools (`auth_status`, `auth_login`).

#### Scenario: Tool listing
- **WHEN** an MCP client lists tools
- **THEN** all tools above are present with descriptions that state units and defaults, and
  `create_price_list` is absent

## ADDED Requirements

### Requirement: Schemas are readable as resources
The MCP server SHALL expose each supported service's card schema as a resource, and an index of
the services with their frontend version and coverage. Reading a resource SHALL need no auth and
no browser.

#### Scenario: Agent reads a schema
- **WHEN** a client reads the schema resource for a supported service
- **THEN** it receives the service's controls, option names, dependencies and ranges, and no browser starts

### Requirement: Option errors name the legal values
A validation error for a card option SHALL name the field and list the legal values or range, and
SHALL name the resource or tool where the full schema can be read.

#### Scenario: Illegal value
- **WHEN** a card option holds a value the schema does not allow
- **THEN** the error lists the allowed values or range and points to the schema resource
