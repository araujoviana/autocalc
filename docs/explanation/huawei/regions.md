# Regions (`Region ID` vs. `Location` vs. `Portal Label`)

*Specs: `huawei/region-availability` › Service must be sold in the region; Region-specific
options and prices*

Huawei Cloud uses three different strings to refer to a region. `autocalc` distinguishes them explicitly so you never confuse a city name with a technical region code:

1. **Region ID** (e.g., `sa-brazil-1`, `la-south-2`, `ap-southeast-3`) — The canonical technical identifier used in API requests, catalogs, and lockfiles.
2. **Location** (e.g., `São Paulo, Brazil`, `Santiago, Chile`, `Singapore`) — The human-readable geographic location (city/country).
3. **Portal Label** (e.g., `LA-Sao Paulo1`, `LA-Santiago`, `AP-Singapore`) — Huawei Cloud's internal label in the calculator web UI.

Every `autocalc` command and YAML quote file (`defaults.region`, `environments.<env>.region`, or per-resource `region`) accepts either the **Region ID** (`sa-brazil-1`) or the **Location** (`"São Paulo"`, `"Santiago"`), and normalizes it to the canonical **Region ID**.

```bash
autocalc regions ecs
```

```text
REGION ID        LOCATION                       PORTAL LABEL
af-north-1       Cairo, Egypt                   AF-Cairo
af-south-1       Johannesburg, South Africa     AF-Johannesburg
ap-southeast-1   Hong Kong, China               CN-Hong Kong
ap-southeast-2   Bangkok, Thailand              AP-Bangkok
ap-southeast-3   Singapore                      AP-Singapore
ap-southeast-4   Jakarta, Indonesia             AP-Jakarta
la-north-2       Mexico City 2, Mexico          LA-Mexico City2
la-south-2       Santiago, Chile                LA-Santiago
na-mexico-1      Mexico City 1, Mexico          LA-Mexico City1
sa-brazil-1      São Paulo, Brazil              LA-Sao Paulo1
...
```

---

## Key Rules

- **Availability differs.** Not every service is sold in every region, and a service's
  catalog differs in size and shape between regions (missing groups, different plan modes). For
  example, SFS capacity-oriented is sold in `sa-brazil-1` (São Paulo, Brazil) but not in `la-south-2` (Santiago, Chile).
- **Prices differ.** The same SKU costs different amounts in different regions. For example,
  `c7n.large.2` monthly was about USD 40 in `la-south-2` (Santiago, Chile) and about USD 62 in `sa-brazil-1` (São Paulo, Brazil).
  Never reuse one region's price for another.
- **Ambiguous location queries fail closed.** `"Mexico"` matches both `na-mexico-1` (`Mexico City 1, Mexico`) and
  `la-north-2` (`Mexico City 2, Mexico`), and `"EU"` matches both `eu-west-0` and `eu-west-101`, so `autocalc` refuses to guess and lists the candidate Region IDs.

---

## Common Region Reference Table

| Region ID | Geographic Location | Portal Label |Accepted Location Shorthands |
|---|---|---|---|
| `sa-brazil-1` | São Paulo, Brazil | `LA-Sao Paulo1` | `"São Paulo"`, `"Sao Paulo"`, `Brazil`, `Brasil` |
| `la-south-2` | Santiago, Chile | `LA-Santiago` | `Santiago`, `Chile` |
| `la-north-2` | Mexico City 2, Mexico | `LA-Mexico City2` | `"Mexico City 2"`, `"Mexico City2"` |
| `na-mexico-1` | Mexico City 1, Mexico | `LA-Mexico City1` | `"Mexico City 1"`, `"Mexico City1"` |
| `sa-peru-1` | Lima, Peru | `LA-Lima1` | `Lima`, `Peru` |
| `sa-argentina-1` | Buenos Aires, Argentina | `LA-Buenos Aires1` | `"Buenos Aires"`, `Argentina` |
| `ap-southeast-1` | Hong Kong, China | `CN-Hong Kong` | `"Hong Kong"` |
| `ap-southeast-2` | Bangkok, Thailand | `AP-Bangkok` | `Bangkok` |
| `ap-southeast-3` | Singapore | `AP-Singapore` | `Singapore` |
| `ap-southeast-4` | Jakarta, Indonesia | `AP-Jakarta` | `Jakarta` |
| `ap-southeast-5` | Manila, Philippines | `AP-Manila` | `Manila` |
| `af-south-1` | Johannesburg, South Africa | `AF-Johannesburg` | `Johannesburg`, `"South Africa"` |
| `af-north-1` | Cairo, Egypt | `AF-Cairo` | `Cairo` |
| `me-east-1` | Riyadh, Saudi Arabia | `ME-East-Riyadh1` | `Riyadh`, `"Saudi Arabia"` |
| `tr-west-1` | Istanbul, Turkey | `TR-Istanbul` | `Istanbul` |
| `eu-west-0` | Paris / Dublin (EU West 0) | `EU-West-0` | `Paris`, `Dublin`, `Amsterdam` |
| `eu-west-101` | Dublin, Ireland (EU West 101) | `EU-Dublin` | `eu-west-101` |

`sa-brazil-1` (São Paulo, Brazil), `la-south-2` (Santiago, Chile) and `ap-southeast-3` (Singapore) are the primary
regions, in that order: the region sweep covers them by default and a `SERVICE_NOT_SOLD` hint lists
them first.

`autocalc` verifies every service across four benchmark regions: `sa-brazil-1` (São Paulo, Brazil), `la-south-2`
(Santiago, Chile), `ap-southeast-1` (Hong Kong, China) and `ap-southeast-3` (Singapore).
