# huawei/card-schema Specification

## Purpose
A service's accepted card options are described by a schema generated from the calculator page itself, committed as data, so that what is mapped, what is not, and what changed are visible.

## Requirements

### Requirement: A schema is generated from the page
The system SHALL generate a YAML schema from each supported service's calculator page anonymously
and without saving lists. For every control the schema SHALL record the control id, kind, option name,
preceding controls (`after`, marked `source: order`), and value range or static options when offered.
Observed dependencies are marked `source: observed`. Each schema SHALL name the frontend version.

#### Scenario: Generate a schema
- **WHEN** a schema is generated for a supported service
- **THEN** the file lists each visible control with id, kind, option name and preceding controls, names the frontend version, and no saved list is created

#### Scenario: Region-dependent values
- **WHEN** a control's option values differ by region or by earlier choices
- **THEN** the schema records the control and its dependencies and marks the values as resolved from the catalog, instead of listing values for one region only

### Requirement: Hand-written fields are separate from generated ones
Regeneration SHALL NOT overwrite hand-written fields (option name, notes, unsupported markers).
A control the page offers but no one has named SHALL appear as unmapped, not be dropped.

#### Scenario: Regenerate after editing notes
- **WHEN** a schema with hand-written notes is regenerated
- **THEN** the notes and option names are kept and only the generated fields change

### Requirement: Coverage of controls is reported
The system SHALL report, per service, the page controls that are mapped, unmapped and marked
unsupported, and the share of mapped controls.

#### Scenario: Unmapped control
- **WHEN** the page shows a control no option maps to
- **THEN** the coverage report lists its id and kind as unmapped

### Requirement: Schema drift is detected
The system SHALL compare a freshly generated schema with the committed one and report added,
removed and changed controls and any frontend version change. It SHALL NOT modify the committed
schema unless asked.

#### Scenario: Frontend adds a control
- **WHEN** the page gains a control since the committed schema was generated
- **THEN** the drift report lists the control as added and the committed file is unchanged

#### Scenario: No drift
- **WHEN** nothing changed
- **THEN** the drift report is empty and the command succeeds
