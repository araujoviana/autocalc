## ADDED Requirements

### Requirement: Tools that drive a browser work over MCP
Every tool SHALL run off the server's event loop so that tools using a browser (`publish_quote`,
`auth_login`) complete when called by an MCP client.

#### Scenario: Publish over MCP
- **WHEN** an MCP client calls `publish_quote` for a decided draft
- **THEN** the list is saved, checked and its link returned, as from the CLI
