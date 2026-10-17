# huawei/candidates Specification

## Purpose

Turn a requirement into priced Huawei candidates from the public catalog, refusing requests
the region cannot serve instead of guessing.

## Requirements

### Requirement: Candidates come from the region's catalog
For a requirement, the Huawei provider SHALL return the SKUs of that service sold in that
region that have a list price for the requested billing mode, with their vCPUs and memory where
the catalog states them and their USD list price. Prices SHALL be exact decimals.

#### Scenario: Priced SKUs only
- **WHEN** candidates are requested for monthly billing and a SKU has no monthly price
- **THEN** that SKU is not among the candidates

### Requirement: Unavailable requests are refused with an alternative
When the service is not sold in the region, or the region does not offer the billing mode, the
provider SHALL raise the existing actionable availability error naming where it is offered. It
SHALL NOT return an empty list in place of an error.

#### Scenario: Service not sold in the region
- **WHEN** candidates are requested for a service that is not sold in the requested region
- **THEN** a `SERVICE_NOT_SOLD` error names the regions where it is sold

### Requirement: Unsupported billing modes are rejected
The provider SHALL accept only on-demand, monthly and yearly billing. Any other mode SHALL be
rejected with a validation error that lists the allowed modes.

#### Scenario: RI requested
- **WHEN** a requirement asks for RI billing
- **THEN** a validation error names `billing` and lists `ondemand`, `monthly` and `yearly`
