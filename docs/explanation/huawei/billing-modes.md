# Billing modes

*Specs: `huawei/card-encoding` › RI exists only where the catalog offers it; `huawei/rating` ›
Billing mode mapping*

## Which services have RI

Only ECS (and HECS) expose a Reserved-Instance plan (`billingMode == "RI"`). Most other
services have no RI, but they do have a **yearly** plan or package, which is usually 10× the
monthly price (two months free). Check every plan of a SKU, not just the first:
`product_info(service, region)["product"][group][i]["planList"][*].billingMode`.

## ECS yearly goes through RI

Most ECS flavors expose yearly only as an RI plan. Some flavors have **no** `YEARLY` plan at all,
so for those the RI plan is the 1-year basis.

## Services with no yearly mode

APIG has no yearly mode. A year is billed pay-per-use over 8760 h.

## Choosing a 1-year basis without RI

| Item | Usual basis | Why |
|---|---|---|
| CCE cluster | yearly | yearly = 10× monthly; no RI |
| RDS | yearly | yearly = 10× monthly; monthly over-quotes |
| SFS Turbo | yearly | yearly is the discounted basis |
| OBS | yearly prepaid package | pick the smallest package that **covers** the usage, never less |
| ELB | yearly | yearly ≈ 9.7× monthly |

OBS packages come in 40 GB, 100 GB, 500 GB, 1, 2, 5, 10, 20, 50, 100, 200 and 300 TB.

## Modelling rules of thumb

- A service where one instance hosts many objects is quoted as **one instance**, not N. An APIG
  instance hosts many APIs, and a RabbitMQ or Kafka instance hosts many queues or topics.
  Genuinely per-instance resources (each ELB, each RDS cluster, each ECS server) stay
  per-instance.
- SFS Turbo's 20 MB/s tier has a calculator minimum of about 3.6 TiB (3,686 GB). The
  `standard` tier allows smaller.
