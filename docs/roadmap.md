# Roadmap

Work moves through OpenSpec changes in this order. Each change carries its own spec delta and
lands when its code does ([ADR-0000](adr/0000-record-architecture-decisions.md)). Archived changes
live in `openspec/changes/archive/`.

| # | Change | Delivers |
|---|---|---|
| 1 | `auth-sessions` | Persistent browser profile as the credential, system browser ([ADR-0011](adr/0011-auth-browser-profile-is-the-credential.md)) |
| 2 | `spa-encoder-poc` | Time-boxed proof that driving the real form yields Edit-faithful cards ([ADR-0001](adr/0001-page-as-encoder.md)) |
| 3 | `quote-core` | Provider-neutral quote model (strangler core, [ADR-0015](adr/0015-strangler-core-and-aws-second.md)) |
| 4 | `publish-gate` | Fail-closed verification before a link is returned ([ADR-0003](adr/0003-fail-closed-publish-gate.md)) |
| 5 | `workflow-surface` | `draft_quote` → `revise_quote` → `publish_quote`, CLI and MCP from one registry ([ADR-0007](adr/0007-workflow-surface-and-one-registry.md)) |
| 6 | `spa-encoder` | Page-as-encoder for the seven existing services |
| 7 | `distribution` | `uv tool` install from git tags, `install.sh` / `install.ps1` ([ADR-0013](adr/0013-distribution-uv-tool-from-git-tags.md)) |
| 8 | `builder-wave-1` | The 13 existing builders verified on the page; 20 of 93 quotable services ([v1 scope](explanation/v1-scope.md)) |
| 9 | `builder-wave-2` | Databases and storage via form recipes; 33 of 93 quotable services |
| 10 | `builder-wave-3` | Networking, security and middleware via form recipes; 50 of 93 quotable services; v1 (47) reached |

AWS is v2.

## Open items

These came out of the retired backlog. They're tracked here rather than in an issue tracker.
Each item is either assigned to the change that will close it or left unscheduled.

| Item | Goes to |
|---|---|
| Refresh the two golden tests that query the live catalog: `test_golden_ecs_ri` (the 'AlmaLinux 9.4 64bit' image is gone from `sa-brazil-1`) and `test_ecs_template_render` (21 of 779 corpus cards drift, limit is 2) | unscheduled |
| Migrate the MCP server from `FastMCP` to `MCPServer` (not in `mcp` 1.x, which is pinned `<2`) | unscheduled, when the SDK ships it |
| `publish_quote` for services beyond the 50 verified ones | unscheduled |
| Map ranked catalog specs onto each recipe service's page values (until then `publish_quote` warns that the spec was not applied) | unscheduled |
| Quotes that span several regions in one saved list | `quote-core` |
| Availability-zone handling for services that price per AZ | `quote-core` |
| Browser setup by the installer (`autocalc doctor` says when `install-browser` is needed) | unscheduled |
| Nightly frontend drift check (alert when the calculator version or a service config changes) | unscheduled, after `distribution` |
| Nightly live and render test jobs on CI (they need a stored session) | unscheduled, after `distribution` |
| Region sweep (`tests.support.region_sweep`, 2026-10-23): in `eu-west-101` 34 of the 100 verified combinations fail because the builders' default SKUs are not sold there (`CBC.6006` / `SPEC_NOT_FOUND`); `hecs` is not offered there; `obs` needs a checkbox-group control the encoder cannot fill. In the primary regions (São Paulo, Santiago, Singapore) 298 of 300 combinations pass and the only failures are the two `obs` rows in Singapore | unscheduled |
| The calculator's EU and China sites | unscheduled, after v1 |

When an item is done, remove its row in the same commit as the change that closes it.
