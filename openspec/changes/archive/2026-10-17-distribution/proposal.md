# Proposal

## Why

ADR-0013: installing today means cloning the repo and running `uv sync`. Users want one command
to install and one to update, on Linux and Windows (ADR-0012). The `keyring` dependency exists
only to delete session copies that earlier versions wrote (ADR-0011) and can go.

## What Changes

- `install.sh` and `install.ps1`: install `uv` if missing, install autocalc from the newest
  semver git tag (`uv tool install git+<repo>@<tag>`; `AUTOCALC_REF` pins another ref), register
  the MCP server when the `claude` CLI is on `PATH`, and print the next steps (`autocalc doctor`,
  `autocalc login`).
- `autocalc update [--to vX.Y.Z]`: reinstall from the newest tag, or from the one named.
- Drop the `keyring` dependency. The one-time cleanup still deletes the `session*.json` copies;
  it no longer touches the keyring.
- README and the first-quote tutorial lead with the installer.

## Out of scope

- The once-a-day update notice in tool results (ADR-0013): it adds a network call to every tool
  result; roadmap row.
- Browser install by the installer: `autocalc doctor` already says when `install-browser` is needed.
- Creating or pushing release tags.
- Any change to the publish gate.

## Publish-gate impact

None.

## Capabilities

- New: `distribution`.
- Modified: `huawei/auth-sessions` (legacy cleanup no longer touches the keyring).
