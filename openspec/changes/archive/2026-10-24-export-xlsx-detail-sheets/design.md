## Decisions

- Quantities are already multiplied into each product (`productNum`), so line totals are
  per-unit value times `productNum`; vCPUs and RAM come from the product's description text.
- Counted: instances, vCPUs and RAM of virtual machines and database instances; storage of disks,
  database volumes, message-queue storage and SFS Turbo; backup vault capacity separately.
  Not counted (a note on Totals says so): bandwidth (the unit is unclear), containers and usage-billed services.
- The draft index is one JSON file next to the drafts, `list id -> draft id`, written when a list is published.
