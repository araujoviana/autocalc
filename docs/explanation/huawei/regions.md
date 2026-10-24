# Regions

*Specs: `huawei/region-availability` › Service must be sold in the region; Region-specific
options and prices*

- **Availability differs.** Not every service is sold in every region, and a service's
  catalog differs in size and shape between regions (missing groups, different plan modes). For
  example, SFS capacity-oriented is sold in `sa-brazil-1` but not in `la-south-2`.
- **Prices differ.** The same SKU costs different amounts in different regions. For example,
  `c7n.large.2` monthly was about USD 40 in Santiago and about USD 62 in São Paulo (2026-10-13).
  Never reuse one region's price for another.
- **Friendly names are ambiguous.** "Mexico" matches both `na-mexico-1` (Mexico City1) and
  `la-north-2` (Mexico City2), so autocalc asks instead of guessing.

São Paulo (`sa-brazil-1`), Santiago (`la-south-2`) and Singapore (`ap-southeast-3`) are the primary
regions, in that order: the region sweep covers them by default and a `SERVICE_NOT_SOLD` hint lists
them first.

autocalc verifies every service in four regions: `sa-brazil-1` (São Paulo), `la-south-2`
(Santiago), `ap-southeast-1` (Hong Kong) and `ap-southeast-3` (Singapore).
