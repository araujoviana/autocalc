# distribution Specification

## Purpose

Installing and updating autocalc takes one command on Linux and Windows, from a semver git tag.

## Requirements

### Requirement: One-command install from a git tag
The installers (`install.sh` on Linux, `install.ps1` on Windows) SHALL install `uv` when it is
missing, install autocalc as a `uv` tool from the newest `v<major>.<minor>.<patch>` tag of the
repository (or from the ref in `AUTOCALC_REF`), and stop with a message naming the cause when
no tag exists or a step fails. They SHALL NOT run a silent auto-update.

#### Scenario: Fresh machine
- **WHEN** the installer runs and `uv` is missing
- **THEN** `uv` is installed first, then autocalc from the newest tag, and the next steps are printed

#### Scenario: No release tag
- **WHEN** the repository has no semver tag and `AUTOCALC_REF` is unset
- **THEN** the installer exits non-zero saying no release tag was found, and installs nothing

### Requirement: MCP registration is best effort
The installers SHALL register the `autocalc-mcp` server with the `claude` CLI when it is on
`PATH`, and otherwise print the command to run. A failed registration SHALL NOT fail the install.

#### Scenario: No agent CLI
- **WHEN** `claude` is not on `PATH`
- **THEN** the install succeeds and prints the registration command

### Requirement: Update on request
`autocalc update` SHALL reinstall the tool from the newest semver tag, or from `--to <tag>`, and
print the old and new version. It SHALL fail with a message when no tag is found or the install
step fails.

#### Scenario: Newer tag exists
- **WHEN** the installed version is `0.1.0`, the newest tag is `v0.2.0` and the user runs `autocalc update`
- **THEN** the tool is reinstalled from `v0.2.0` and `0.1.0 -> 0.2.0` is printed

#### Scenario: Pinned tag
- **WHEN** the user runs `autocalc update --to v0.1.0`
- **THEN** the tool is reinstalled from `v0.1.0`, whatever the newest tag is

#### Scenario: Not a release tag
- **WHEN** the user runs `autocalc update --to main`
- **THEN** it fails naming the expected `vX.Y.Z` form and changes nothing

### Requirement: Tool results carry an update notice at most once a day
When a newer semver release tag exists than the installed version, object-shaped tool results
SHALL carry an `update_notice` naming the new version and `autocalc update`. The tag lookup SHALL
run at most once a day, SHALL NOT fail the tool call, SHALL NOT update anything, and SHALL be
disabled by `AUTOCALC_NO_UPDATE_CHECK`.

#### Scenario: Newer release
- **WHEN** the newest tag is `v0.2.0`, `0.1.0` is installed and no lookup ran today
- **THEN** the result carries an `update_notice` naming `0.2.0`, and a second result the same day carries none

#### Scenario: Offline
- **WHEN** the tag lookup fails
- **THEN** the tool result is returned unchanged
