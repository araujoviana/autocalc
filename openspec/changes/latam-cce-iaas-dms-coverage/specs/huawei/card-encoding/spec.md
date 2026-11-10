## ADDED Requirements

### Requirement: Regional CCE Standard and Turbo quotation
CCE quotations SHALL represent Standard and Turbo configurations offered by the selected region's calculator, including its cluster sizes, master configurations, billing modes and exposed placement selectors. Unsupported or unavailable combinations SHALL fail before saving with an actionable reason. Standard input compatibility SHALL be retained.

#### Scenario: Turbo is sold in the selected region
- **WHEN** a caller requests a Turbo configuration sold by that region's calculator
- **THEN** the encoded card preserves the requested category, scale, master configuration and billing mode through Edit

#### Scenario: Product unavailable in Santiago
- **WHEN** the regional calculator does not sell the requested CCE combination in Santiago
- **THEN** planning reports regional unavailability without using São Paulo values

### Requirement: Infrastructure variants retain requested configuration
In-scope infrastructure quotations SHALL preserve the selected regional product variant, billing mode, quantity, capacity, usage and exposed placement selectors. Dedicated ELB capacity charging and EIP dedicated/shared bandwidth SHALL be representable where sold. No product variant SHALL silently fall back to another variant.

#### Scenario: Dedicated ELB with capacity usage
- **WHEN** a caller requests a sold dedicated ELB configuration with capacity-unit usage
- **THEN** the card preserves the configuration and usage and all required price checks agree

#### Scenario: Shared bandwidth
- **WHEN** a caller requests shared bandwidth sold by the region's calculator
- **THEN** the encoded card retains shared bandwidth rather than substituting dedicated bandwidth

### Requirement: DMS configurations use matching regional specifications
Kafka and RabbitMQ quotations SHALL support the regional calculator's offered instance and storage variants and billing modes. Conversion rates, valid broker counts and storage semantics SHALL match the selected configuration. Unknown specifications or invalid counts SHALL fail with a specific validation error rather than use guessed or obsolete conversion values.

#### Scenario: New regional DMS specification
- **WHEN** a regional specification has a recoverable conversion rate in the matching calculator configuration
- **THEN** quotation uses that rate and verifies the encoded instance and storage quantities

#### Scenario: Invalid broker topology
- **WHEN** a caller requests a broker count not offered for the chosen topology
- **THEN** validation rejects it before a list is saved

### Requirement: CCE architecture quotes include their component resources
A CCE architecture quotation SHALL account for requested worker compute, disks and public networking as separate supported cards, without implying that the cluster management card includes them. Requested resource quantities SHALL survive encoding and publication.

#### Scenario: Complete cluster architecture
- **WHEN** a declarative quote contains CCE, Linux worker ECS, EVS, public NAT, EIP and dedicated ELB resources
- **THEN** planning and publication account for each requested component and return verifiable totals
