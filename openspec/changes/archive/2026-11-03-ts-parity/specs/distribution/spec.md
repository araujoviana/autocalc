## MODIFIED Requirements

### Requirement: One-command install from a git tag
The installers (`install.sh` on Linux, `install.ps1` on Windows) SHALL install `bun` when it is
missing, install autocalc globally with `bun` from the newest `v<major>.<minor>.<patch>` tag of the
repository (or from the ref in `AUTOCALC_REF`), and stop with a message naming the cause when
no tag exists or a step fails. They SHALL NOT run a silent auto-update.

#### Scenario: Fresh machine
- **WHEN** the installer runs and `bun` is missing
- **THEN** `bun` is installed first, then autocalc from the newest tag, and the next steps are printed

#### Scenario: No release tag
- **WHEN** the repository has no semver tag and `AUTOCALC_REF` is unset
- **THEN** the installer exits non-zero saying no release tag was found, and installs nothing
