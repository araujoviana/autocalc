## Decisions

**D1. Warn, do not refuse.** Recipe services are valid from options alone, and defaults-only
quotes are legitimate, so refusing would make them unpublishable. The warning goes in the
existing `warnings` list, which already reaches the CLI and MCP result.

**D2. Not for builder services.** Those apply the spec through `spec_arg`; only services with
no `spec_arg` and a recipe are warned about.
