## ADDED Requirements

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
