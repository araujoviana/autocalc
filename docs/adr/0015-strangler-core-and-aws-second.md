---
status: accepted
date: 2026-10-16
---

# Strangler migration to a provider-neutral core; AWS second

## Context and Problem Statement

The current code (~4.7k lines) works for several Huawei services, but its edges are many. AWS
Pricing Calculator support is wanted next. Rewrite, or evolve?

## Considered Options

* Big-bang rewrite.
* Keep extending the Huawei-shaped code and bolt AWS on.
* **Strangler:** build a provider-neutral core (model, ranking, draft store, run records,
  `Provider` protocol) that wraps the existing Huawei modules, then migrate service by service.

## Decision Outcome

Chosen option: **strangler**:
* The core arrives first, with `HuaweiProvider` wrapping today's catalog, rating, availability
  and list modules.
* Services migrate one at a time to the page encoder (ADR-0001), each passing the gate in the
  four verification regions: `sa-brazil-1`, `la-south-2`, `ap-southeast-1` and `ap-southeast-3`.

**v1** is the core, at least 50% of quotable Huawei services verified, CLI parity, the installer
and these docs. **v2** adds an `AwsProvider` (EC2, EBS, EKS, S3, RDS, EFS, ELB), using the AWS
calculator's own backend, behind the same core.

### Consequences

* Good, because something works at every step, and the gate guards each migrated service.
* Bad, because old and new code coexist for a while. Each migrated service deletes its old
  builder.
