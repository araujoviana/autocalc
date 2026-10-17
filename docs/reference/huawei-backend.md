# Huawei calculator backend

Observed against frontend `CBC-PortalCalculator/11.4.201` (2026-10-13). This is an
undocumented, third-party API; any frontend release can change it. The intl site's host is
`portal-intl.huaweicloud.com` (`portal.` for China, `portal.eu.` for the EU).

## Endpoints

Prefix: `https://portal-intl.huaweicloud.com/api/`. All the endpoints below answer without
cookies except `share/*` writes and `formExport`.

| Purpose | Method / path |
|---|---|
| Service menu, regions, unit ids | `GET calculator/rest/cbc/portalcalculatornodeservice/v4/api/menuInfo?sign=common&language=en-us` |
| A service's full price list in one region | `GET …/v4/api/productInfo?urlPath=ecs&tag=general.online.portal&region=sa-brazil-1&tab=calc&sign=common` |
| Label pack (`dataInfo_N_`, `calc_N_` placeholders) | `GET …/v4/api/language?urlPath=all&language=en-us` |
| Per-service form config and logic | `GET …/v4/api/config?urlPath=obs&sign=common` |
| **Rating engine** | `POST cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource` |
| Exchange rates (USD base) | `GET cbc/global/rest/cbc/csbpaymentservice/v1/exchange-rate?page_no=1&page_size=100` |
| Saved lists | `…/v4/api/share/{add,list,detail,update,delete,copy}`; `detail` is anonymous |
| Excel export | `…/v4/api/formExport` (session) |

The frontend's disaster-recovery mirror serves the same JSON:
`https://res-static.hc-cdn.cn/pricecalculator/intl/product/{service}_general.online.portal_{region}_calc_productInfo.json`
and `…/common_en-us_menuInfo.json`.

## `productInfo` shape

`product[group][]`. Each item has `cloudServiceType`, `resourceType`, `resourceSpecCode`,
`productSpecSysDesc` and `planList[]`. Each plan has `billingMode`
(ONDEMAND/MONTHLY/YEARLY/RI), `amount` (USD), `usageFactor` and `measureUnit`. ECS in one
region is about 4 MB with over 2,000 VM SKUs, and also contains EVS disks, EIP and bandwidth.

## Rating request

```json
{"regionId":"sa-brazil-1","chargingMode":0,"periodType":2,"periodNum":1,"subscriptionNum":1,"siteCode":"HWC",
 "productInfos":[
  {"id":"a","cloudServiceType":"hws.service.type.ec2","resourceType":"hws.resource.type.vm","resourceSpecCode":"c7n.large.2.linux","productNum":3},
  {"id":"b","cloudServiceType":"hws.service.type.ebs","resourceType":"hws.resource.type.volume","resourceSpecCode":"SSD","productNum":3,"resourceSize":100,"resouceSizeMeasureId":17}]}
```

- `chargingMode`: 0 = period (monthly/yearly), 1 = on-demand, 10 = RI.
- `periodType`: 2 = month, 3 = year, 4 = hour.
- On-demand items need `usageFactor` (`Duration` for compute; per-plan values such as
  `size_warm_3az` for OBS), `usageMeasureId` (4 = hour, 10/17 = GB, 54 = requests) and
  `usageValue`.
- `resouceSizeMeasureId` is misspelled by the API itself.
- Failures come back as `{"exceptionId": "CBC.6006", …}` (see [Errors](errors.md)).

## Saved-list card shape

`cartListData[] = {buyUrl, rewriteValue, selectedProduct}`. A card product is the catalog SKU
minus `planList`, plus:
- `bakPlanList` (the plans of the chosen mode) and the chosen plan's fields;
- `productNum`, `resourceSize`, `inquiryTag` and `selectIndex`;
- the `addToList_*` label tokens;
- `inquiryResult`.

`share/add` sends only `billingMode`, `cartListData`, `name` and `totalPrice`.
`share/detail` reads any list anonymously.
